CREATE OR REPLACE FUNCTION public.member_last_activity(_member_id uuid)
RETURNS TABLE(last_at timestamptz, audit_started_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT MAX(created_at) FROM public.activity_audit WHERE member_id = _member_id),
    (SELECT MIN(created_at) FROM public.activity_audit);
$$;

GRANT EXECUTE ON FUNCTION public.member_last_activity(uuid) TO anon, authenticated;