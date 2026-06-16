ALTER TABLE public.members ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

INSERT INTO public.members (name, is_demo, has_password)
VALUES ('TESTER', true, true)
ON CONFLICT (name) DO UPDATE SET is_demo = true, has_password = true;

INSERT INTO public.member_credentials (member_id, password_hash)
SELECT id, extensions.crypt('test', extensions.gen_salt('bf', 10))
FROM public.members WHERE name = 'TESTER'
ON CONFLICT (member_id) DO UPDATE
  SET password_hash = extensions.crypt('test', extensions.gen_salt('bf', 10)),
      updated_at = now();

CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _mid uuid;
  _d date;
  _i int;
  _topics text[] := ARRAY[
    'Studied system design patterns',
    'Built a new feature for the app',
    'Read research papers on ML',
    'Refactored database queries',
    'Worked through algorithm problems',
    'Wrote technical documentation',
    'Designed UI mockups',
    'Debugged production issue',
    'Code review and architecture planning',
    'Learning a new framework'
  ];
  _learnings text[] := ARRAY[
    'Realized I can simplify the data flow by lifting state up one level.',
    'Indexing on the right columns cut query time from 800ms to 40ms.',
    'Pair programming surfaces edge cases I would have missed solo.',
    'Breaking the problem into smaller functions made the bug obvious.',
    'Reading the source is often faster than reading the docs.'
  ];
  _gym_statuses text[] := ARRAY['yes','yes','yes','home','yes','no','yes'];
BEGIN
  SELECT id INTO _mid FROM members WHERE name = 'TESTER';
  IF _mid IS NULL THEN RETURN; END IF;

  DELETE FROM dw_comments WHERE author_id = _mid
    OR deep_work_id IN (SELECT id FROM deep_work WHERE member_id = _mid);
  DELETE FROM deep_work WHERE member_id = _mid;
  DELETE FROM deep_work_bonuses WHERE member_id = _mid;
  DELETE FROM gym_logs WHERE member_id = _mid;
  DELETE FROM sleep_logs WHERE member_id = _mid;
  DELETE FROM macros_logs WHERE member_id = _mid;
  DELETE FROM sleep_targets WHERE member_id = _mid;
  DELETE FROM push_subscriptions WHERE member_id = _mid;
  DELETE FROM member_sessions WHERE member_id = _mid;

  UPDATE members
    SET avatar_url = NULL, team_id = NULL, calorie_goal = 2200
    WHERE id = _mid;

  INSERT INTO sleep_targets(member_id, target_sleep, target_wake)
  VALUES (_mid, '22:30'::time, '06:30'::time);

  FOR _i IN 0..13 LOOP
    _d := current_date - _i;

    IF _i % 7 <> 6 THEN
      INSERT INTO gym_logs(member_id, date, status)
      VALUES (_mid, _d, _gym_statuses[(_i % 7) + 1]::gym_status);
    END IF;

    INSERT INTO sleep_logs(member_id, date, sleep_time, wake_time, hours)
    VALUES (_mid, _d,
      ('22:30'::time + ((_i % 4) * interval '15 min'))::time,
      ('06:30'::time + ((_i % 4) * interval '15 min'))::time,
      7.5 + ((_i % 5) * 0.25));

    INSERT INTO macros_logs(member_id, date, calories, protein, carbs, fat, sugar, water)
    VALUES (_mid, _d,
      2000 + (_i * 37) % 400,
      140 + (_i * 11) % 50,
      200 + (_i * 13) % 80,
      60 + (_i * 7) % 25,
      30 + (_i * 5) % 20,
      (2 + (_i % 3))::text || 'L');

    IF _i % 5 <> 4 THEN
      INSERT INTO deep_work(member_id, date, topic, minutes, started_at, finished_at, learnings, personal_notes)
      VALUES (
        _mid, _d,
        _topics[(_i % array_length(_topics, 1)) + 1],
        45 + (_i * 13) % 90,
        (_d + time '09:00')::timestamptz,
        (_d + time '09:00' + ((45 + (_i * 13) % 90) * interval '1 min'))::timestamptz,
        _learnings[(_i % array_length(_learnings, 1)) + 1],
        CASE WHEN _i % 3 = 0 THEN 'Felt sharp today.' ELSE NULL END
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.demo_login()
RETURNS TABLE(member_id uuid, token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _mid uuid; _tok uuid;
BEGIN
  SELECT id INTO _mid FROM members WHERE name = 'TESTER' AND is_demo = true;
  IF _mid IS NULL THEN RAISE EXCEPTION 'demo_not_found'; END IF;
  INSERT INTO member_sessions(member_id) VALUES (_mid) RETURNING member_sessions.token INTO _tok;
  RETURN QUERY SELECT _mid, _tok;
END $$;

CREATE OR REPLACE FUNCTION public.trigger_demo_reset()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.reset_demo_data();
END $$;

SELECT public.reset_demo_data();

DROP FUNCTION IF EXISTS public.list_due_reminders();
CREATE OR REPLACE FUNCTION public.list_due_reminders()
 RETURNS TABLE(id uuid, endpoint text, p256dh text, auth text, title text, body text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _settings notification_settings%ROWTYPE;
  _today date := current_date;
  _now_time time := (now() AT TIME ZONE 'UTC')::time;
BEGIN
  SELECT * INTO _settings FROM notification_settings WHERE id = 1;
  IF _settings IS NULL THEN RETURN; END IF;
  IF _settings.last_sent_date IS NOT NULL AND _settings.last_sent_date >= _today THEN RETURN; END IF;
  IF _now_time < _settings.reminder_time THEN RETURN; END IF;

  RETURN QUERY
  SELECT s.id, s.endpoint, s.p256dh, s.auth, _settings.reminder_title, _settings.reminder_body
  FROM push_subscriptions s
  JOIN members m ON m.id = s.member_id
  WHERE s.enabled = true AND m.is_demo = false;
END $function$;

GRANT EXECUTE ON FUNCTION public.demo_login() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_demo_reset() TO anon, authenticated;