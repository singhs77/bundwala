
-- 1. Private credentials table
CREATE TABLE public.member_credentials (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.member_credentials TO service_role;
ALTER TABLE public.member_credentials ENABLE ROW LEVEL SECURITY;
-- No policies: only SECURITY DEFINER funcs (running as postgres) and service_role can touch it.

-- 2. Copy existing hashes
INSERT INTO public.member_credentials (member_id, password_hash)
SELECT id, password_hash FROM public.members
WHERE password_hash IS NOT NULL AND length(password_hash) > 0;

-- 3. Replace generated has_password column with a regular one
ALTER TABLE public.members DROP COLUMN has_password;
ALTER TABLE public.members ADD COLUMN has_password boolean NOT NULL DEFAULT false;
UPDATE public.members m
SET has_password = true
WHERE EXISTS (SELECT 1 FROM public.member_credentials c WHERE c.member_id = m.id);

-- 4. Drop the sensitive column from the public-readable table
ALTER TABLE public.members DROP COLUMN password_hash;

-- 5. Rewrite functions to use member_credentials
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
  UPDATE members SET has_password = true WHERE id = _member_id;
  INSERT INTO member_sessions(member_id) VALUES (_member_id) RETURNING token INTO _token;
  RETURN _token;
END $function$;
