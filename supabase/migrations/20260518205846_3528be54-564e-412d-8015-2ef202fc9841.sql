
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.member_sessions (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_sessions_member ON public.member_sessions(member_id);
ALTER TABLE public.member_sessions ENABLE ROW LEVEL SECURITY;
-- No policies = no public access. Only SECURITY DEFINER functions touch it.

-- ============================================================
-- Admin settings (single row)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id int PRIMARY KEY DEFAULT 1,
  password_hash text,
  CHECK (id = 1)
);
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.admin_settings(id, password_hash)
VALUES (1, crypt('changeme', gen_salt('bf', 10)))
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- has_password computed column on members
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='members' AND column_name='has_password') THEN
    ALTER TABLE public.members
    ADD COLUMN has_password boolean
    GENERATED ALWAYS AS (password_hash IS NOT NULL AND length(password_hash) > 0) STORED;
  END IF;
END $$;

-- ============================================================
-- Unique constraints required for ON CONFLICT
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.gym_logs'::regclass AND conname='gym_logs_member_date_key') THEN
    ALTER TABLE public.gym_logs ADD CONSTRAINT gym_logs_member_date_key UNIQUE (member_id, date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sleep_logs'::regclass AND conname='sleep_logs_member_date_key') THEN
    ALTER TABLE public.sleep_logs ADD CONSTRAINT sleep_logs_member_date_key UNIQUE (member_id, date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.macros_logs'::regclass AND conname='macros_logs_member_date_key') THEN
    ALTER TABLE public.macros_logs ADD CONSTRAINT macros_logs_member_date_key UNIQUE (member_id, date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.scoring_rules'::regclass AND contype IN ('p','u')) THEN
    ALTER TABLE public.scoring_rules ADD CONSTRAINT scoring_rules_category_key UNIQUE (category);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.free_days'::regclass AND contype IN ('p','u')) THEN
    ALTER TABLE public.free_days ADD CONSTRAINT free_days_date_key UNIQUE (date);
  END IF;
END $$;

-- ============================================================
-- Internal helper: resolve session token -> member_id
-- ============================================================
CREATE OR REPLACE FUNCTION public._member_from_token(_token uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _mid uuid;
BEGIN
  IF _token IS NULL THEN RAISE EXCEPTION 'invalid_session'; END IF;
  SELECT member_id INTO _mid FROM member_sessions
  WHERE token = _token AND expires_at > now();
  IF _mid IS NULL THEN RAISE EXCEPTION 'invalid_session'; END IF;
  RETURN _mid;
END $$;
REVOKE EXECUTE ON FUNCTION public._member_from_token(uuid) FROM PUBLIC;

-- ============================================================
-- Member password ops
-- ============================================================
CREATE OR REPLACE FUNCTION public.member_set_password(_member_id uuid, _current_password text, _new_password text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _hash text; _token uuid;
BEGIN
  IF _new_password IS NULL OR length(_new_password) < 4 THEN RAISE EXCEPTION 'password_too_short'; END IF;
  IF length(_new_password) > 200 THEN RAISE EXCEPTION 'password_too_long'; END IF;
  SELECT password_hash INTO _hash FROM members WHERE id = _member_id;
  IF _hash IS NOT NULL AND length(_hash) > 0 THEN
    IF _hash LIKE '$2%' THEN
      IF crypt(_current_password, _hash) <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
    ELSE
      IF encode(digest(_current_password, 'sha256'), 'hex') <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
    END IF;
  END IF;
  UPDATE members SET password_hash = crypt(_new_password, gen_salt('bf', 10)) WHERE id = _member_id;
  INSERT INTO member_sessions(member_id) VALUES (_member_id) RETURNING token INTO _token;
  RETURN _token;
END $$;

CREATE OR REPLACE FUNCTION public.member_verify_password(_member_id uuid, _password text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _hash text; _token uuid;
BEGIN
  SELECT password_hash INTO _hash FROM members WHERE id = _member_id;
  IF _hash IS NULL OR length(_hash) = 0 THEN RAISE EXCEPTION 'no_password_set'; END IF;
  IF _hash LIKE '$2%' THEN
    IF crypt(_password, _hash) <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
  ELSE
    IF encode(digest(_password, 'sha256'), 'hex') <> _hash THEN RAISE EXCEPTION 'wrong_password'; END IF;
    UPDATE members SET password_hash = crypt(_password, gen_salt('bf', 10)) WHERE id = _member_id;
  END IF;
  INSERT INTO member_sessions(member_id) VALUES (_member_id) RETURNING token INTO _token;
  RETURN _token;
END $$;

CREATE OR REPLACE FUNCTION public.member_rename(_token uuid, _new_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _new_name IS NULL OR length(trim(_new_name)) = 0 OR length(_new_name) > 60 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  UPDATE members SET name = trim(_new_name) WHERE id = _mid;
END $$;

CREATE OR REPLACE FUNCTION public.member_set_avatar(_token uuid, _url text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _url IS NOT NULL AND length(_url) > 1000 THEN RAISE EXCEPTION 'url_too_long'; END IF;
  UPDATE members SET avatar_url = _url WHERE id = _mid;
END $$;

CREATE OR REPLACE FUNCTION public.member_logout(_token uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM member_sessions WHERE token = _token;
END $$;

-- ============================================================
-- Activity logging
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_gym(_token uuid, _date date, _status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _status NOT IN ('yes','no','home') THEN RAISE EXCEPTION 'bad_status'; END IF;
  IF _date > current_date OR _date < current_date - interval '180 days' THEN RAISE EXCEPTION 'bad_date'; END IF;
  INSERT INTO gym_logs(member_id, date, status) VALUES (_mid, _date, _status::gym_status)
  ON CONFLICT (member_id, date) DO UPDATE SET status = EXCLUDED.status;
END $$;

CREATE OR REPLACE FUNCTION public.log_sleep(_token uuid, _date date, _sleep_time time, _wake_time time, _hours numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _date > current_date OR _date < current_date - interval '180 days' THEN RAISE EXCEPTION 'bad_date'; END IF;
  IF _hours IS NOT NULL AND (_hours < 0 OR _hours > 16) THEN RAISE EXCEPTION 'bad_hours'; END IF;
  INSERT INTO sleep_logs(member_id, date, sleep_time, wake_time, hours)
  VALUES (_mid, _date, _sleep_time, _wake_time, _hours)
  ON CONFLICT (member_id, date) DO UPDATE
  SET sleep_time = EXCLUDED.sleep_time, wake_time = EXCLUDED.wake_time, hours = EXCLUDED.hours;
END $$;

CREATE OR REPLACE FUNCTION public.log_macros(_token uuid, _date date, _calories int, _protein int, _carbs int, _fat int, _sugar int, _water int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _date > current_date OR _date < current_date - interval '180 days' THEN RAISE EXCEPTION 'bad_date'; END IF;
  IF (_calories IS NOT NULL AND (_calories < 0 OR _calories > 20000))
   OR (_protein  IS NOT NULL AND (_protein  < 0 OR _protein  > 2000))
   OR (_carbs    IS NOT NULL AND (_carbs    < 0 OR _carbs    > 2000))
   OR (_fat      IS NOT NULL AND (_fat      < 0 OR _fat      > 2000))
   OR (_sugar    IS NOT NULL AND (_sugar    < 0 OR _sugar    > 2000))
   OR (_water    IS NOT NULL AND (_water    < 0 OR _water    > 20000)) THEN
    RAISE EXCEPTION 'bad_value';
  END IF;
  INSERT INTO macros_logs(member_id, date, calories, protein, carbs, fat, sugar, water)
  VALUES (_mid, _date, _calories, _protein, _carbs, _fat, _sugar, _water)
  ON CONFLICT (member_id, date) DO UPDATE
  SET calories=EXCLUDED.calories, protein=EXCLUDED.protein, carbs=EXCLUDED.carbs,
      fat=EXCLUDED.fat, sugar=EXCLUDED.sugar, water=EXCLUDED.water;
END $$;

CREATE OR REPLACE FUNCTION public.log_deep_work(_token uuid, _date date, _topic text, _minutes int, _learnings text, _personal_notes text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _mid uuid; _id uuid; _started timestamptz; _finished timestamptz;
BEGIN
  _mid := _member_from_token(_token);
  IF _date > current_date OR _date < current_date - interval '180 days' THEN RAISE EXCEPTION 'bad_date'; END IF;
  IF _minutes IS NOT NULL AND (_minutes < 1 OR _minutes > 600) THEN RAISE EXCEPTION 'bad_minutes'; END IF;
  IF _topic IS NOT NULL AND length(_topic) > 200 THEN RAISE EXCEPTION 'topic_too_long'; END IF;
  IF length(coalesce(_learnings,'')) > 5000 OR length(coalesce(_personal_notes,'')) > 5000 THEN RAISE EXCEPTION 'text_too_long'; END IF;
  _finished := now();
  _started  := _finished - (coalesce(_minutes,0) * interval '1 minute');
  INSERT INTO deep_work(member_id, date, topic, minutes, started_at, finished_at, learnings, personal_notes)
  VALUES (_mid, _date, nullif(trim(coalesce(_topic,'')),''), _minutes, _started, _finished,
          nullif(_learnings,''), nullif(_personal_notes,''))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.add_dw_comment(_token uuid, _deep_work_id uuid, _body text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _body IS NULL OR length(trim(_body)) = 0 THEN RAISE EXCEPTION 'empty_body'; END IF;
  IF length(_body) > 1000 THEN RAISE EXCEPTION 'too_long'; END IF;
  INSERT INTO dw_comments(deep_work_id, author_id, body) VALUES (_deep_work_id, _mid, _body);
END $$;

-- ============================================================
-- Admin ops
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_verify(_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _hash text;
BEGIN
  SELECT password_hash INTO _hash FROM admin_settings WHERE id = 1;
  RETURN _hash IS NOT NULL AND crypt(_password, _hash) = _hash;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_password(_current text, _new text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT admin_verify(_current) THEN RAISE EXCEPTION 'wrong_password'; END IF;
  IF _new IS NULL OR length(_new) < 4 THEN RAISE EXCEPTION 'password_too_short'; END IF;
  UPDATE admin_settings SET password_hash = crypt(_new, gen_salt('bf', 10)) WHERE id = 1;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_upsert_rule(_password text, _category text, _points numeric, _cap numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT admin_verify(_password) THEN RAISE EXCEPTION 'wrong_password'; END IF;
  INSERT INTO scoring_rules(category, points_per_entry, weekly_cap)
  VALUES (_category, _points, _cap)
  ON CONFLICT (category) DO UPDATE
  SET points_per_entry = EXCLUDED.points_per_entry, weekly_cap = EXCLUDED.weekly_cap;
END $$;

CREATE OR REPLACE FUNCTION public.admin_add_free_day(_password text, _date date, _label text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT admin_verify(_password) THEN RAISE EXCEPTION 'wrong_password'; END IF;
  INSERT INTO free_days(date, label) VALUES (_date, _label)
  ON CONFLICT (date) DO UPDATE SET label = EXCLUDED.label;
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_free_day(_password text, _date date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT admin_verify(_password) THEN RAISE EXCEPTION 'wrong_password'; END IF;
  DELETE FROM free_days WHERE date = _date;
END $$;

-- ============================================================
-- Lock down direct writes; keep public reads where appropriate
-- ============================================================
DROP POLICY IF EXISTS "public insert members" ON public.members;
DROP POLICY IF EXISTS "public update members" ON public.members;
DROP POLICY IF EXISTS "public delete members" ON public.members;

DROP POLICY IF EXISTS "public insert gym_logs" ON public.gym_logs;
DROP POLICY IF EXISTS "public update gym_logs" ON public.gym_logs;
DROP POLICY IF EXISTS "public delete gym_logs" ON public.gym_logs;

DROP POLICY IF EXISTS "public insert sleep_logs" ON public.sleep_logs;
DROP POLICY IF EXISTS "public update sleep_logs" ON public.sleep_logs;
DROP POLICY IF EXISTS "public delete sleep_logs" ON public.sleep_logs;

DROP POLICY IF EXISTS "public insert macros_logs" ON public.macros_logs;
DROP POLICY IF EXISTS "public update macros_logs" ON public.macros_logs;
DROP POLICY IF EXISTS "public delete macros_logs" ON public.macros_logs;

DROP POLICY IF EXISTS "public insert deep_work" ON public.deep_work;
DROP POLICY IF EXISTS "public update deep_work" ON public.deep_work;
DROP POLICY IF EXISTS "public delete deep_work" ON public.deep_work;

DROP POLICY IF EXISTS "public insert dw_comments" ON public.dw_comments;
DROP POLICY IF EXISTS "public update dw_comments" ON public.dw_comments;
DROP POLICY IF EXISTS "public delete dw_comments" ON public.dw_comments;

DROP POLICY IF EXISTS "public insert scoring_rules" ON public.scoring_rules;
DROP POLICY IF EXISTS "public update scoring_rules" ON public.scoring_rules;
DROP POLICY IF EXISTS "public delete scoring_rules" ON public.scoring_rules;

DROP POLICY IF EXISTS "public insert free_days" ON public.free_days;
DROP POLICY IF EXISTS "public update free_days" ON public.free_days;
DROP POLICY IF EXISTS "public delete free_days" ON public.free_days;

-- Hide password_hash via column-level grants (PostgREST respects these)
REVOKE SELECT ON public.members FROM anon, authenticated;
GRANT SELECT (id, name, avatar_url, team_id, created_at, has_password) ON public.members TO anon, authenticated;

-- ============================================================
-- Grant RPC execution
-- ============================================================
GRANT EXECUTE ON FUNCTION public.member_set_password(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_verify_password(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_rename(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_set_avatar(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_logout(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_gym(uuid, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_sleep(uuid, date, time, time, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_macros(uuid, date, int, int, int, int, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_deep_work(uuid, date, text, int, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_dw_comment(uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_password(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_rule(text, text, numeric, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_free_day(text, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_free_day(text, date) TO anon, authenticated;

-- ============================================================
-- Realtime
-- ============================================================
ALTER TABLE public.gym_logs    REPLICA IDENTITY FULL;
ALTER TABLE public.sleep_logs  REPLICA IDENTITY FULL;
ALTER TABLE public.macros_logs REPLICA IDENTITY FULL;
ALTER TABLE public.deep_work   REPLICA IDENTITY FULL;
ALTER TABLE public.dw_comments REPLICA IDENTITY FULL;
ALTER TABLE public.free_days   REPLICA IDENTITY FULL;
ALTER TABLE public.scoring_rules REPLICA IDENTITY FULL;

DO $$
BEGIN
  PERFORM 1 FROM pg_publication WHERE pubname = 'supabase_realtime';
  IF FOUND THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.gym_logs;    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sleep_logs;  EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.macros_logs; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.deep_work;   EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.dw_comments; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.free_days;   EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.scoring_rules; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
