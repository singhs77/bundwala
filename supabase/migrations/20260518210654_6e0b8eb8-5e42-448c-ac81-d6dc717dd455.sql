
CREATE OR REPLACE FUNCTION public.member_verify_password(_member_id uuid, _password text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE _hash text; _token uuid;
BEGIN
  SELECT password_hash INTO _hash FROM members WHERE id = _member_id;
  IF _hash IS NULL OR length(_hash) = 0 THEN RAISE EXCEPTION 'no_password_set'; END IF;
  IF _hash LIKE '$2%' THEN
    IF extensions.crypt(_password, _hash) <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
  ELSE
    IF encode(extensions.digest(_password, 'sha256'), 'hex') <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
    UPDATE members SET password_hash = extensions.crypt(_password, extensions.gen_salt('bf', 10)) WHERE id = _member_id;
  END IF;
  INSERT INTO member_sessions(member_id) VALUES (_member_id) RETURNING token INTO _token;
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
  SELECT password_hash INTO _hash FROM members WHERE id = _member_id;
  IF _hash IS NOT NULL AND length(_hash) > 0 THEN
    IF _hash LIKE '$2%' THEN
      IF extensions.crypt(_current_password, _hash) <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
    ELSE
      IF encode(extensions.digest(_current_password, 'sha256'), 'hex') <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
    END IF;
  END IF;
  UPDATE members SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf', 10)) WHERE id = _member_id;
  INSERT INTO member_sessions(member_id) VALUES (_member_id) RETURNING token INTO _token;
  RETURN _token;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_verify(_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE _hash text;
BEGIN
  SELECT password_hash INTO _hash FROM admin_settings WHERE id = 1;
  RETURN _hash IS NOT NULL AND extensions.crypt(_password, _hash) = _hash;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_set_password(_current text, _new text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT admin_verify(_current) THEN RAISE EXCEPTION 'wrong_password'; END IF;
  IF _new IS NULL OR length(_new) < 4 THEN RAISE EXCEPTION 'password_too_short'; END IF;
  UPDATE admin_settings SET password_hash = extensions.crypt(_new, extensions.gen_salt('bf', 10)) WHERE id = 1;
  RETURN true;
END $function$;
