CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  reminder_local_time time,
  tz_offset_minutes integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  last_reminder_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read push_subscriptions"
  ON public.push_subscriptions FOR SELECT USING (true);

CREATE INDEX idx_push_subs_member ON public.push_subscriptions(member_id);

CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  _token uuid,
  _endpoint text,
  _p256dh text,
  _auth text,
  _reminder_local_time time,
  _tz_offset_minutes integer,
  _enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  INSERT INTO push_subscriptions(member_id, endpoint, p256dh, auth, reminder_local_time, tz_offset_minutes, enabled)
  VALUES (_mid, _endpoint, _p256dh, _auth, _reminder_local_time, COALESCE(_tz_offset_minutes,0), COALESCE(_enabled,true))
  ON CONFLICT (endpoint) DO UPDATE
    SET member_id = EXCLUDED.member_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        reminder_local_time = EXCLUDED.reminder_local_time,
        tz_offset_minutes = EXCLUDED.tz_offset_minutes,
        enabled = EXCLUDED.enabled;
END $$;

CREATE OR REPLACE FUNCTION public.update_push_reminder(
  _token uuid,
  _endpoint text,
  _reminder_local_time time,
  _tz_offset_minutes integer,
  _enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  UPDATE push_subscriptions
  SET reminder_local_time = _reminder_local_time,
      tz_offset_minutes = COALESCE(_tz_offset_minutes, tz_offset_minutes),
      enabled = COALESCE(_enabled, enabled)
  WHERE endpoint = _endpoint AND member_id = _mid;
END $$;

CREATE OR REPLACE FUNCTION public.delete_push_subscription(_token uuid, _endpoint text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  DELETE FROM push_subscriptions WHERE endpoint = _endpoint AND member_id = _mid;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_subscriptions(_password text)
RETURNS TABLE(id uuid, member_id uuid, endpoint text, p256dh text, auth text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT admin_verify(_password) THEN RAISE EXCEPTION 'wrong_password'; END IF;
  RETURN QUERY SELECT s.id, s.member_id, s.endpoint, s.p256dh, s.auth
    FROM push_subscriptions s WHERE s.enabled = true;
END $$;

CREATE OR REPLACE FUNCTION public.list_due_reminders()
RETURNS TABLE(id uuid, endpoint text, p256dh text, auth text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _utc_now timestamptz := now();
BEGIN
  RETURN QUERY
  SELECT s.id, s.endpoint, s.p256dh, s.auth
  FROM push_subscriptions s
  WHERE s.enabled = true
    AND s.reminder_local_time IS NOT NULL
    AND (s.last_reminder_date IS NULL
         OR s.last_reminder_date <> (date_trunc('day', _utc_now + make_interval(mins => s.tz_offset_minutes)))::date)
    AND (
      EXTRACT(HOUR FROM (_utc_now + make_interval(mins => s.tz_offset_minutes))) * 60
      + EXTRACT(MINUTE FROM (_utc_now + make_interval(mins => s.tz_offset_minutes)))
    ) BETWEEN
      (EXTRACT(HOUR FROM s.reminder_local_time) * 60 + EXTRACT(MINUTE FROM s.reminder_local_time))
      AND
      (EXTRACT(HOUR FROM s.reminder_local_time) * 60 + EXTRACT(MINUTE FROM s.reminder_local_time) + 14);
END $$;

CREATE OR REPLACE FUNCTION public.mark_reminder_sent(_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _utc_now timestamptz := now();
BEGIN
  UPDATE push_subscriptions
  SET last_reminder_date = (date_trunc('day', _utc_now + make_interval(mins => tz_offset_minutes)))::date
  WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_push_subscription_by_endpoint(_endpoint text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM push_subscriptions WHERE endpoint = _endpoint;
END $$;