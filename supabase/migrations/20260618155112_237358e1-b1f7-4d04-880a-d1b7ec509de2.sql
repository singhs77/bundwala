
-- Password reset requests for member-style auth (no email on file)
CREATE TABLE public.password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.members(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated;
GRANT SELECT, INSERT ON public.password_reset_requests TO anon;
GRANT ALL ON public.password_reset_requests TO service_role;

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- No direct access — everything goes through SECURITY DEFINER RPCs.
CREATE POLICY "no_direct_access" ON public.password_reset_requests
  FOR ALL USING (false) WITH CHECK (false);

CREATE INDEX idx_prr_open ON public.password_reset_requests (requested_at DESC) WHERE resolved_at IS NULL;

-- Member can flag "I forgot my password" without proving identity.
CREATE OR REPLACE FUNCTION public.request_password_reset(_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = _member_id) THEN
    RAISE EXCEPTION 'member_not_found';
  END IF;
  -- Collapse duplicates: only one open request per member
  IF EXISTS (
    SELECT 1 FROM public.password_reset_requests
    WHERE member_id = _member_id AND resolved_at IS NULL
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.password_reset_requests (member_id) VALUES (_member_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_password_reset(uuid) TO anon, authenticated;

-- Admin lists open requests.
CREATE OR REPLACE FUNCTION public.admin_list_password_resets(_password text)
RETURNS TABLE(id uuid, member_id uuid, member_name text, requested_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._verify_admin(_password);
  RETURN QUERY
    SELECT r.id, r.member_id, m.name, r.requested_at
    FROM public.password_reset_requests r
    JOIN public.members m ON m.id = r.member_id
    WHERE r.resolved_at IS NULL
    ORDER BY r.requested_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_password_resets(text) TO anon, authenticated;

-- Admin clears the member's password and resolves the request.
-- After this, the member can pick a new password on next login (set-password flow).
CREATE OR REPLACE FUNCTION public.admin_clear_member_password(_password text, _member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._verify_admin(_password);
  UPDATE public.members
  SET password_hash = NULL
  WHERE id = _member_id;
  -- Invalidate any active sessions for this member
  DELETE FROM public.member_sessions WHERE member_id = _member_id;
  UPDATE public.password_reset_requests
  SET resolved_at = now()
  WHERE member_id = _member_id AND resolved_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_member_password(text, uuid) TO anon, authenticated;
