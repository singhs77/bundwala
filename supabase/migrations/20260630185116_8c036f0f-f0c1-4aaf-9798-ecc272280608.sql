ALTER TABLE public.member_sessions ALTER COLUMN expires_at SET DEFAULT (now() + interval '1 year');

CREATE OR REPLACE FUNCTION public.touch_session(_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _token IS NULL THEN RETURN; END IF;
  UPDATE member_sessions
    SET expires_at = now() + interval '1 year'
    WHERE token = _token AND expires_at > now();
END $function$;

UPDATE public.member_sessions SET expires_at = now() + interval '1 year' WHERE expires_at > now();