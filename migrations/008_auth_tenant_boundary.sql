CREATE OR REPLACE FUNCTION public.moarix_is_relation_owner(relation_name regclass)
RETURNS boolean AS $$
  SELECT current_user = pg_get_userbyid(c.relowner)
  FROM pg_catalog.pg_class AS c
  WHERE c.oid = relation_name;
$$ LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp;

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companies_context_isolation ON companies;
CREATE POLICY companies_context_isolation ON companies
  USING (id = public.moarix_current_company_id() OR public.moarix_is_relation_owner('public.companies'::regclass))
  WITH CHECK (id = public.moarix_current_company_id() OR public.moarix_is_relation_owner('public.companies'::regclass));

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_members_context_isolation ON company_members;
CREATE POLICY company_members_context_isolation ON company_members
  USING (company_id = public.moarix_current_company_id() OR public.moarix_is_relation_owner('public.company_members'::regclass))
  WITH CHECK (company_id = public.moarix_current_company_id() OR public.moarix_is_relation_owner('public.company_members'::regclass));

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_context_select ON users;
CREATE POLICY users_context_select ON users FOR SELECT
  USING (
    public.moarix_is_relation_owner('public.users'::regclass)
    OR EXISTS (
      SELECT 1 FROM public.company_members AS m
      WHERE m.company_id = public.moarix_current_company_id() AND m.user_id = users.id
    )
  );
DROP POLICY IF EXISTS users_context_insert ON users;
CREATE POLICY users_context_insert ON users FOR INSERT
  WITH CHECK (public.moarix_current_company_id() IS NOT NULL OR public.moarix_is_relation_owner('public.users'::regclass));
DROP POLICY IF EXISTS users_context_update ON users;
CREATE POLICY users_context_update ON users FOR UPDATE
  USING (
    public.moarix_is_relation_owner('public.users'::regclass)
    OR EXISTS (
      SELECT 1 FROM public.company_members AS m
      WHERE m.company_id = public.moarix_current_company_id() AND m.user_id = users.id
    )
  )
  WITH CHECK (
    public.moarix_is_relation_owner('public.users'::regclass)
    OR EXISTS (
      SELECT 1 FROM public.company_members AS m
      WHERE m.company_id = public.moarix_current_company_id() AND m.user_id = users.id
    )
  );

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_context_isolation ON sessions;
CREATE POLICY sessions_context_isolation ON sessions
  USING (company_id = public.moarix_current_company_id() OR public.moarix_is_relation_owner('public.sessions'::regclass))
  WITH CHECK (company_id = public.moarix_current_company_id() OR public.moarix_is_relation_owner('public.sessions'::regclass));

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
    AND s.expires_at > now()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.moarix_login_lookup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moarix_find_session(text) FROM PUBLIC;
