-- Lock down member_credentials from any direct client access.
-- All legitimate access happens via SECURITY DEFINER functions
-- (member_verify_password, member_set_password) which bypass RLS.
REVOKE ALL ON public.member_credentials FROM anon, authenticated;

ALTER TABLE public.member_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all direct access to member_credentials" ON public.member_credentials;
CREATE POLICY "Deny all direct access to member_credentials"
  ON public.member_credentials
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);