CREATE OR REPLACE FUNCTION public.touch_session(_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _token IS NULL THEN RETURN; END IF;
  UPDATE member_sessions
    SET expires_at = now() + interval '30 days'
    WHERE token = _token AND expires_at > now();
END $$;

GRANT EXECUTE ON FUNCTION public.touch_session(uuid) TO anon, authenticated;