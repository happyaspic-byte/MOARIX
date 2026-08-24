CREATE OR REPLACE FUNCTION public.moarix_login_lookup(login_email text)
RETURNS TABLE (
  user_id uuid,
  company_id uuid,
  password_hash text,
  user_name text,
  email text,
  company_name text,
  role text
) AS $$
  SELECT u.id, m.company_id, u.password_hash, u.name, u.email, c.name, m.role
  FROM public.users AS u
  JOIN public.company_members AS m ON m.user_id = u.id AND m.is_active = true
  JOIN public.companies AS c ON c.id = m.company_id AND c.is_active = true
  WHERE u.email = login_email AND u.is_active = true
  ORDER BY m.created_at ASC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.moarix_find_session(session_token_hash text)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  company_id uuid,
  user_name text,
  email text,
  company_name text,
  company_timezone text,
  role text,
  expires_at timestamptz
) AS $$
  SELECT s.id, u.id, c.id, u.name, u.email, c.name, c.timezone, m.role, s.expires_at
  FROM public.sessions AS s
  JOIN public.users AS u ON u.id = s.user_id AND u.is_active = true
  JOIN public.companies AS c ON c.id = s.company_id AND c.is_active = true
  JOIN public.company_members AS m
    ON m.company_id = s.company_id AND m.user_id = s.user_id AND m.is_active = true
  WHERE s.token_hash = session_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > pg_catalog.now()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.moarix_create_session(
  new_session_id uuid,
  account_user_id uuid,
  account_company_id uuid,
  session_token_hash text,
  session_expires_at timestamptz,
  session_user_agent text,
  session_ip_hash text,
  login_identifier_hash text
)
RETURNS void AS $$
BEGIN
  IF account_company_id IS DISTINCT FROM public.moarix_current_company_id() THEN
    RAISE EXCEPTION 'Session company does not match the active tenant context'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS u
    JOIN public.company_members AS m
      ON m.user_id = u.id
     AND m.company_id = account_company_id
     AND m.is_active = true
    JOIN public.companies AS c
      ON c.id = m.company_id
     AND c.is_active = true
    WHERE u.id = account_user_id
      AND u.is_active = true
  ) THEN
    RAISE EXCEPTION 'Cannot create a session for an inactive account'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.login_attempts
  WHERE identifier_hash = login_identifier_hash;

  DELETE FROM public.sessions
  WHERE expires_at < pg_catalog.now()
     OR revoked_at < pg_catalog.now() - interval '7 days';

  INSERT INTO public.sessions
    (id, user_id, company_id, token_hash, expires_at, user_agent, ip_hash)
  VALUES
    (new_session_id, account_user_id, account_company_id, session_token_hash,
     session_expires_at, session_user_agent, session_ip_hash);

  UPDATE public.users
  SET last_login_at = pg_catalog.now()
  WHERE id = account_user_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.moarix_touch_session(active_session_id uuid)
RETURNS void AS $$
  UPDATE public.sessions
  SET last_seen_at = pg_catalog.now()
  WHERE id = active_session_id
    AND company_id = public.moarix_current_company_id()
    AND revoked_at IS NULL
    AND expires_at > pg_catalog.now()
    AND last_seen_at < pg_catalog.now() - interval '5 minutes';
$$ LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.moarix_revoke_session(session_token_hash text)
RETURNS void AS $$
  UPDATE public.sessions
  SET revoked_at = pg_catalog.now()
  WHERE token_hash = session_token_hash
    AND revoked_at IS NULL;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.moarix_revoke_user_sessions(
  target_company_id uuid,
  target_user_id uuid
)
RETURNS void AS $$
  UPDATE public.sessions
  SET revoked_at = pg_catalog.now()
  WHERE company_id = target_company_id
    AND company_id = public.moarix_current_company_id()
    AND user_id = target_user_id
    AND revoked_at IS NULL;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.moarix_login_lookup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moarix_find_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moarix_create_session(uuid, uuid, uuid, text, timestamptz, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moarix_touch_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moarix_revoke_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moarix_revoke_user_sessions(uuid, uuid) FROM PUBLIC;

CREATE INDEX IF NOT EXISTS sessions_expiry_cleanup_idx
  ON public.sessions (expires_at);
CREATE INDEX IF NOT EXISTS sessions_revoked_cleanup_idx
  ON public.sessions (revoked_at)
  WHERE revoked_at IS NOT NULL;
