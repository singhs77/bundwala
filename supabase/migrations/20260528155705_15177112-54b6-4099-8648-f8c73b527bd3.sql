GRANT SELECT ON public.members TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;