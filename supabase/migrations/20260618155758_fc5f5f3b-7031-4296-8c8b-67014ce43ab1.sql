
CREATE OR REPLACE FUNCTION public.admin_list_password_resets(_password text)
RETURNS TABLE(id uuid, member_id uuid, member_name text, requested_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT admin_verify(_password) THEN RAISE EXCEPTION 'wrong_password'; END IF;
  RETURN QUERY
    SELECT r.id, r.member_id, m.name, r.requested_at
    FROM public.password_reset_requests r
    JOIN public.members m ON m.id = r.member_id
    WHERE r.resolved_at IS NULL
    ORDER BY r.requested_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_member_password(_password text, _member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT admin_verify(_password) THEN RAISE EXCEPTION 'wrong_password'; END IF;
  DELETE FROM public.member_credentials WHERE member_id = _member_id;
  UPDATE public.members SET has_password = false WHERE id = _member_id;
  DELETE FROM public.member_sessions WHERE member_id = _member_id;
  UPDATE public.password_reset_requests
    SET resolved_at = now()
    WHERE member_id = _member_id AND resolved_at IS NULL;
END;
$$;
