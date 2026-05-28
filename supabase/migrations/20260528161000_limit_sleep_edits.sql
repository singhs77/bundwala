CREATE OR REPLACE FUNCTION public.log_sleep(_token uuid, _date date, _sleep_time time, _wake_time time, _hours numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _date NOT IN (current_date, current_date - 1) THEN RAISE EXCEPTION 'sleep_date_locked'; END IF;
  IF _hours IS NOT NULL AND (_hours < 0 OR _hours > 16) THEN RAISE EXCEPTION 'bad_hours'; END IF;
  INSERT INTO sleep_logs(member_id, date, sleep_time, wake_time, hours)
  VALUES (_mid, _date, _sleep_time, _wake_time, _hours)
  ON CONFLICT (member_id, date) DO UPDATE
  SET sleep_time = EXCLUDED.sleep_time, wake_time = EXCLUDED.wake_time, hours = EXCLUDED.hours;
END $function$;

CREATE OR REPLACE FUNCTION public.delete_sleep(_token uuid, _date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _date NOT IN (current_date, current_date - 1) THEN RAISE EXCEPTION 'sleep_date_locked'; END IF;
  DELETE FROM sleep_logs WHERE member_id = _mid AND date = _date;
END $function$;
