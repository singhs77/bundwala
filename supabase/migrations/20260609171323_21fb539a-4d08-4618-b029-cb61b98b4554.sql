
-- Explicit restrictive deny policies for sensitive tables.
-- These tables are only accessed via SECURITY DEFINER functions; clients must never read/write them directly.

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_admin_settings" ON public.admin_settings;
CREATE POLICY "deny_all_admin_settings" ON public.admin_settings
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

ALTER TABLE public.member_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_member_sessions" ON public.member_sessions;
CREATE POLICY "deny_all_member_sessions" ON public.member_sessions
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "deny_all_push_subscriptions" ON public.push_subscriptions
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
