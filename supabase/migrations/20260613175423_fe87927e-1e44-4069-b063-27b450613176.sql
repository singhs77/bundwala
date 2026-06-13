DROP POLICY IF EXISTS "public read activity_audit" ON public.activity_audit;
REVOKE SELECT ON public.activity_audit FROM anon, authenticated;
GRANT ALL ON public.activity_audit TO service_role;