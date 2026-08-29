CREATE OR REPLACE FUNCTION public.moarix_list_company_sessions(target_company_id uuid)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  user_name text,
  email text,
  last_seen_at timestamptz,
  expires_at timestamptz,
  user_agent text
) AS $$
BEGIN
  IF target_company_id IS DISTINCT FROM public.moarix_current_company_id() THEN
    RAISE EXCEPTION 'company mismatch';
  END IF;
  RETURN QUERY
  SELECT s.id, s.user_id, u.name, u.email, s.last_seen_at, s.expires_at, s.user_agent
  FROM public.sessions s
  JOIN public.users u ON u.id = s.user_id
  WHERE s.company_id = target_company_id
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
  ORDER BY s.last_seen_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.moarix_revoke_user_sessions(target_company_id uuid, target_user_id uuid)
RETURNS void AS $$
BEGIN
  IF target_company_id IS DISTINCT FROM public.moarix_current_company_id() THEN
    RAISE EXCEPTION 'company mismatch';
  END IF;
  UPDATE public.sessions
     SET revoked_at = now()
   WHERE company_id = target_company_id
     AND user_id = target_user_id
     AND revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.moarix_list_company_sessions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moarix_revoke_user_sessions(uuid, uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moarix_app') THEN
    GRANT EXECUTE ON FUNCTION public.moarix_list_company_sessions(uuid) TO moarix_app;
    GRANT EXECUTE ON FUNCTION public.moarix_revoke_user_sessions(uuid, uuid) TO moarix_app;
  END IF;
END $$;
