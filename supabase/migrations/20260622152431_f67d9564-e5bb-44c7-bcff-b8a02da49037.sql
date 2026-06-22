
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

GRANT SELECT (last_login_at) ON public.members TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.member_verify_password(_member_id uuid, _password text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE _hash text; _token uuid;
BEGIN
  SELECT password_hash INTO _hash FROM member_credentials WHERE member_id = _member_id;
  IF _hash IS NULL OR length(_hash) = 0 THEN RAISE EXCEPTION 'no_password_set'; END IF;
  IF _hash LIKE '$2%' THEN
    IF extensions.crypt(_password, _hash) <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
  ELSE
    IF encode(extensions.digest(_password, 'sha256'), 'hex') <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
    UPDATE member_credentials
    SET password_hash = extensions.crypt(_password, extensions.gen_salt('bf', 10)),
        updated_at = now()
    WHERE member_id = _member_id;
  END IF;
  INSERT INTO member_sessions(member_id) VALUES (_member_id) RETURNING token INTO _token;
  UPDATE members SET last_login_at = now() WHERE id = _member_id;
  RETURN _token;
END $function$;

CREATE OR REPLACE FUNCTION public.member_set_password(_member_id uuid, _current_password text, _new_password text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE _hash text; _token uuid;
BEGIN
  IF _new_password IS NULL OR length(_new_password) < 4 THEN RAISE EXCEPTION 'password_too_short'; END IF;
  IF length(_new_password) > 200 THEN RAISE EXCEPTION 'password_too_long'; END IF;
  SELECT password_hash INTO _hash FROM member_credentials WHERE member_id = _member_id;
  IF _hash IS NOT NULL AND length(_hash) > 0 THEN
    IF _hash LIKE '$2%' THEN
      IF extensions.crypt(_current_password, _hash) <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
    ELSE
      IF encode(extensions.digest(_current_password, 'sha256'), 'hex') <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
    END IF;
  END IF;
  INSERT INTO member_credentials(member_id, password_hash)
  VALUES (_member_id, extensions.crypt(_new_password, extensions.gen_salt('bf', 10)))
  ON CONFLICT (member_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, updated_at = now();
  UPDATE members SET has_password = true, last_login_at = now() WHERE id = _member_id;
  INSERT INTO member_sessions(member_id) VALUES (_member_id) RETURNING token INTO _token;
  RETURN _token;
END $function$;

CREATE OR REPLACE FUNCTION public.demo_login()
 RETURNS TABLE(member_id uuid, token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _mid uuid; _tok uuid;
BEGIN
  SELECT id INTO _mid FROM members WHERE name = 'TESTER' AND is_demo = true;
  IF _mid IS NULL THEN RAISE EXCEPTION 'demo_not_found'; END IF;
  INSERT INTO member_sessions(member_id) VALUES (_mid) RETURNING member_sessions.token INTO _tok;
  UPDATE members SET last_login_at = now() WHERE id = _mid;
  RETURN QUERY SELECT _mid, _tok;
END $function$;
