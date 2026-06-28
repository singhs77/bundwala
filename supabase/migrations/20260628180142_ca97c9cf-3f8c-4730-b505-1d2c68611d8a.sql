
-- 1. Columns
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_message text;

-- 2. Ban the three members + clear their sessions
UPDATE public.members
SET is_banned = true,
    ban_message = 'you got too much bread you dont need this shit'
WHERE id IN (
  '1044531d-f8c5-4335-a743-ffe4573b3035', -- Milan
  '4db02445-c19f-4797-a400-eda03918988c', -- Saju Thou
  'bad2f614-bea6-44fd-ba9f-9ec912ee9f24'  -- Dillski
);

DELETE FROM public.member_sessions
WHERE member_id IN (
  '1044531d-f8c5-4335-a743-ffe4573b3035',
  '4db02445-c19f-4797-a400-eda03918988c',
  'bad2f614-bea6-44fd-ba9f-9ec912ee9f24'
);

-- 3. Block banned members from login
CREATE OR REPLACE FUNCTION public.member_verify_password(_member_id uuid, _password text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE _hash text; _token uuid; _banned boolean; _msg text;
BEGIN
  SELECT is_banned, ban_message INTO _banned, _msg FROM members WHERE id = _member_id;
  IF _banned THEN RAISE EXCEPTION 'banned: %', COALESCE(_msg, 'Access removed.'); END IF;
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
DECLARE _hash text; _token uuid; _banned boolean; _msg text;
BEGIN
  SELECT is_banned, ban_message INTO _banned, _msg FROM members WHERE id = _member_id;
  IF _banned THEN RAISE EXCEPTION 'banned: %', COALESCE(_msg, 'Access removed.'); END IF;
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

-- 4. Inactivity overview: for each non-banned, non-demo member,
--    return the worst (max) consecutive-missed-days streak across
--    the 4 categories, counting back from yesterday.
--    A day counts as missed if the member has no log for that date
--    AND that date is not a global free_day.
--    Sleep additionally honors per-row `free_day` flag.
CREATE OR REPLACE FUNCTION public.members_inactivity_overview()
 RETURNS TABLE(member_id uuid, worst_category text, worst_streak int)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _today date := current_date;
  _start date := current_date - interval '30 days';
BEGIN
  RETURN QUERY
  WITH days AS (
    SELECT d::date AS d
    FROM generate_series(_start, _today - 1, interval '1 day') AS d
  ),
  active_members AS (
    SELECT id FROM members WHERE is_banned = false AND is_demo = false
  ),
  free AS (
    SELECT date FROM free_days WHERE date BETWEEN _start AND _today - 1
  ),
  -- For each (member, date, category), 1 = missed, 0 = present/free
  per_day AS (
    SELECT
      am.id AS mid,
      d.d AS day,
      'gym'::text AS cat,
      CASE
        WHEN d.d IN (SELECT date FROM free) THEN 0
        WHEN EXISTS (SELECT 1 FROM gym_logs g WHERE g.member_id = am.id AND g.date = d.d) THEN 0
        ELSE 1
      END AS missed
    FROM active_members am CROSS JOIN days d
    UNION ALL
    SELECT
      am.id, d.d, 'sleep',
      CASE
        WHEN d.d IN (SELECT date FROM free) THEN 0
        WHEN EXISTS (SELECT 1 FROM sleep_logs s WHERE s.member_id = am.id AND s.date = d.d AND COALESCE(s.free_day, false) = false) THEN 0
        WHEN EXISTS (SELECT 1 FROM sleep_logs s WHERE s.member_id = am.id AND s.date = d.d AND s.free_day = true) THEN 0
        ELSE 1
      END
    FROM active_members am CROSS JOIN days d
    UNION ALL
    SELECT
      am.id, d.d, 'macros',
      CASE
        WHEN d.d IN (SELECT date FROM free) THEN 0
        WHEN EXISTS (SELECT 1 FROM macros_logs m WHERE m.member_id = am.id AND m.date = d.d) THEN 0
        ELSE 1
      END
    FROM active_members am CROSS JOIN days d
    UNION ALL
    SELECT
      am.id, d.d, 'deep_work',
      CASE
        WHEN d.d IN (SELECT date FROM free) THEN 0
        WHEN EXISTS (SELECT 1 FROM deep_work dw WHERE dw.member_id = am.id AND dw.date = d.d) THEN 0
        ELSE 1
      END
    FROM active_members am CROSS JOIN days d
  ),
  -- Compute current trailing streak per (member, category): count
  -- consecutive `missed=1` days ending at yesterday.
  ordered AS (
    SELECT mid, cat, day, missed,
           row_number() OVER (PARTITION BY mid, cat ORDER BY day DESC) AS rn
    FROM per_day
  ),
  -- First day (going backwards) where missed=0 ends the streak.
  cutoffs AS (
    SELECT mid, cat, MIN(rn) AS first_present_rn
    FROM ordered
    WHERE missed = 0
    GROUP BY mid, cat
  ),
  streaks AS (
    SELECT o.mid, o.cat,
           COALESCE(c.first_present_rn - 1,
                    (SELECT COUNT(*) FROM days)) AS streak
    FROM (SELECT DISTINCT mid, cat FROM ordered) o
    LEFT JOIN cutoffs c USING (mid, cat)
  ),
  ranked AS (
    SELECT mid, cat, streak,
           row_number() OVER (PARTITION BY mid ORDER BY streak DESC, cat) AS rk
    FROM streaks
  )
  SELECT r.mid, r.cat, r.streak::int
  FROM ranked r
  WHERE r.rk = 1;
END $function$;

GRANT EXECUTE ON FUNCTION public.members_inactivity_overview() TO anon, authenticated;

-- 5. Auto-ban members with 5+ consecutive missed days in any category
CREATE OR REPLACE FUNCTION public.enforce_inactivity_bans()
 RETURNS int
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _count int := 0; _rec record;
BEGIN
  FOR _rec IN
    SELECT member_id FROM public.members_inactivity_overview()
    WHERE worst_streak >= 5
  LOOP
    UPDATE public.members
      SET is_banned = true,
          ban_message = 'Removed for missing 5 consecutive days.'
      WHERE id = _rec.member_id AND is_banned = false;
    DELETE FROM public.member_sessions WHERE member_id = _rec.member_id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END $function$;

GRANT EXECUTE ON FUNCTION public.enforce_inactivity_bans() TO anon, authenticated;
