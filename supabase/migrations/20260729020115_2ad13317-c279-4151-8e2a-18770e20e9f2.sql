
-- 1) Snapshot columns on sleep_logs
ALTER TABLE public.sleep_logs
  ADD COLUMN IF NOT EXISTS target_sleep time,
  ADD COLUMN IF NOT EXISTS target_wake time;

-- Backfill existing rows with each member's CURRENT target so scoring stays identical.
UPDATE public.sleep_logs sl
SET target_sleep = t.target_sleep,
    target_wake = t.target_wake
FROM public.sleep_targets t
WHERE sl.member_id = t.member_id
  AND sl.target_sleep IS NULL
  AND sl.target_wake IS NULL;

-- 2) log_sleep: on insert copy current target; on update of an existing row keep original snapshot.
CREATE OR REPLACE FUNCTION public.log_sleep(_token uuid, _date date, _sleep_time time without time zone, _wake_time time without time zone, _hours numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _mid uuid; _ts time; _tw time;
BEGIN
  _mid := _member_from_token(_token);
  IF _date > current_date OR _date < current_date - interval '180 days' THEN RAISE EXCEPTION 'bad_date'; END IF;
  IF _hours IS NOT NULL AND (_hours < 0 OR _hours > 16) THEN RAISE EXCEPTION 'bad_hours'; END IF;
  SELECT target_sleep, target_wake INTO _ts, _tw FROM sleep_targets WHERE member_id = _mid;
  INSERT INTO sleep_logs(member_id, date, sleep_time, wake_time, hours, target_sleep, target_wake)
  VALUES (_mid, _date, _sleep_time, _wake_time, _hours, _ts, _tw)
  ON CONFLICT (member_id, date) DO UPDATE
  SET sleep_time = EXCLUDED.sleep_time,
      wake_time  = EXCLUDED.wake_time,
      hours      = EXCLUDED.hours;
  -- target_sleep/target_wake NOT touched on conflict → original snapshot preserved
END $function$;

-- 3) sleep_bonuses table
CREATE TABLE IF NOT EXISTS public.sleep_bonuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  date date NOT NULL,
  points numeric NOT NULL DEFAULT 0.1,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sleep_bonuses TO anon, authenticated;
GRANT ALL ON public.sleep_bonuses TO service_role;

ALTER TABLE public.sleep_bonuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read sleep_bonuses" ON public.sleep_bonuses FOR SELECT USING (true);

-- 4) Twin GL bonus
INSERT INTO public.sleep_bonuses (member_id, date, points, reason)
VALUES ('3f45c2b7-c444-42f9-a8cc-8e18bf13c74f', current_date, 0.4, 'manual bonus');
