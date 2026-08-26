CREATE TABLE IF NOT EXISTS public.api_tokens (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  token_hash char(64) NOT NULL UNIQUE
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text NOT NULL
    CHECK (token_prefix ~ '^mxk_[A-Za-z0-9_-]{8,20}$'),
  scopes text[] NOT NULL
    CHECK (
      cardinality(scopes) > 0
      AND array_position(scopes, NULL::text) IS NULL
      AND array_position(scopes, '') IS NULL
    ),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT api_tokens_membership_fkey
    FOREIGN KEY (company_id, user_id)
    REFERENCES public.company_members(company_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT api_tokens_expiry_after_creation
    CHECK (expires_at > created_at),
  CONSTRAINT api_tokens_revoke_after_creation
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS api_tokens_company_prefix_idx
  ON public.api_tokens (company_id, token_prefix);

CREATE INDEX IF NOT EXISTS api_tokens_user_idx
  ON public.api_tokens (user_id);

CREATE INDEX IF NOT EXISTS api_tokens_active_expiry_idx
  ON public.api_tokens (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_tokens_context_isolation ON public.api_tokens;
CREATE POLICY api_tokens_context_isolation ON public.api_tokens
  USING (
    company_id = public.moarix_current_company_id()
    OR public.moarix_is_relation_owner('public.api_tokens'::regclass)
  )
  WITH CHECK (
    company_id = public.moarix_current_company_id()
    OR public.moarix_is_relation_owner('public.api_tokens'::regclass)
  );

CREATE OR REPLACE FUNCTION public.moarix_find_api_token(api_token_hash text)
RETURNS TABLE (
  api_token_id uuid,
  api_token_name text,
  api_token_prefix text,
  user_id uuid,
  company_id uuid,
  user_name text,
  email text,
  company_name text,
  company_timezone text,
  role text,
  scopes text[],
  expires_at timestamptz
) AS $$
DECLARE
  matched record;
BEGIN
  SELECT
    token.id AS api_token_id,
    token.name AS api_token_name,
    token.token_prefix AS api_token_prefix,
    account.id AS user_id,
    company.id AS company_id,
    account.name AS user_name,
    account.email AS email,
    company.name AS company_name,
    company.timezone AS company_timezone,
    membership.role AS role,
    token.scopes AS scopes,
    token.expires_at AS expires_at,
    token.last_used_at AS last_used_at
  INTO matched
  FROM public.api_tokens AS token
  JOIN public.users AS account
    ON account.id = token.user_id
   AND account.is_active = true
  JOIN public.companies AS company
    ON company.id = token.company_id
   AND company.is_active = true
  JOIN public.company_members AS membership
    ON membership.company_id = token.company_id
   AND membership.user_id = token.user_id
   AND membership.is_active = true
  WHERE token.token_hash = api_token_hash
    AND token.revoked_at IS NULL
    AND token.expires_at > pg_catalog.now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF matched.last_used_at IS NULL
     OR matched.last_used_at < pg_catalog.now() - interval '5 minutes' THEN
    UPDATE public.api_tokens AS token
    SET last_used_at = pg_catalog.now()
    WHERE token.id = matched.api_token_id;
  END IF;

  RETURN QUERY SELECT
    matched.api_token_id::uuid,
    matched.api_token_name::text,
    matched.api_token_prefix::text,
    matched.user_id::uuid,
    matched.company_id::uuid,
    matched.user_name::text,
    matched.email::text,
    matched.company_name::text,
    matched.company_timezone::text,
    matched.role::text,
    matched.scopes::text[],
    matched.expires_at::timestamptz;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog;

REVOKE ALL ON FUNCTION public.moarix_find_api_token(text) FROM PUBLIC;
