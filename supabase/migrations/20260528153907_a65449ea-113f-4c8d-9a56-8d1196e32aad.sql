
-- members: hide password hash columns from public roles
REVOKE SELECT (password_hash, has_password) ON public.members FROM anon, authenticated;

-- admin_settings: fully restrict from anon/authenticated; definer RPCs still work
REVOKE ALL ON public.admin_settings FROM anon, authenticated;

-- member_sessions: fully restrict; definer RPCs validate tokens
REVOKE ALL ON public.member_sessions FROM anon, authenticated;

-- push_subscriptions: fully restrict; managed only via definer RPCs
DROP POLICY IF EXISTS "public read push_subscriptions" ON public.push_subscriptions;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;

-- sleep_targets: remove permissive write policies (reads still public)
DROP POLICY IF EXISTS "public insert sleep_targets" ON public.sleep_targets;
DROP POLICY IF EXISTS "public update sleep_targets" ON public.sleep_targets;
DROP POLICY IF EXISTS "public delete sleep_targets" ON public.sleep_targets;

-- teams: remove permissive write policies (reads still public)
DROP POLICY IF EXISTS "public insert teams" ON public.teams;
DROP POLICY IF EXISTS "public update teams" ON public.teams;
DROP POLICY IF EXISTS "public delete teams" ON public.teams;
