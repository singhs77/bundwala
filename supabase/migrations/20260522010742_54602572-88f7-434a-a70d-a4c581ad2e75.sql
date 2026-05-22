
DROP FUNCTION IF EXISTS public.list_due_reminders();

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id integer PRIMARY KEY DEFAULT 1,
  reminder_time time NOT NULL DEFAULT '20:00',
  reminder_title text NOT NULL DEFAULT 'Daily check-in',
  reminder_body text NOT NULL DEFAULT 'Don''t forget to log gym and macros today.',
  last_sent_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_settings_singleton CHECK (id = 1)
);
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read notification_settings" ON public.notification_settings;
CREATE POLICY "public read notification_settings" ON public.notification_settings FOR SELECT USING (true);
INSERT INTO public.notification_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read announcements" ON public.announcements;
CREATE POLICY "public read announcements" ON public.announcements FOR SELECT USING (true);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.get_notification_settings()
RETURNS TABLE(reminder_time time, reminder_title text, reminder_body text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT n.reminder_time, n.reminder_title, n.reminder_body
  FROM notification_settings n WHERE n.id = 1;
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_notification_settings(
  _password text, _time time, _title text, _body text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT admin_verify(_password) THEN RAISE EXCEPTION 'wrong_password'; END IF;
  IF _title IS NULL OR length(trim(_title)) = 0 OR length(_title) > 80 THEN RAISE EXCEPTION 'bad_title'; END IF;
  IF _body IS NULL OR length(trim(_body)) = 0 OR length(_body) > 300 THEN RAISE EXCEPTION 'bad_body'; END IF;
  UPDATE notification_settings
  SET reminder_time = _time, reminder_title = _title, reminder_body = _body, updated_at = now()
  WHERE id = 1;
END $$;

CREATE OR REPLACE FUNCTION public.admin_post_announcement(_password text, _body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT admin_verify(_password) THEN RAISE EXCEPTION 'wrong_password'; END IF;
  IF _body IS NULL OR length(trim(_body)) = 0 OR length(_body) > 1000 THEN RAISE EXCEPTION 'bad_body'; END IF;
  INSERT INTO announcements(body) VALUES (trim(_body)) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_announcement(_password text, _id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT admin_verify(_password) THEN RAISE EXCEPTION 'wrong_password'; END IF;
  DELETE FROM announcements WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.list_due_reminders()
RETURNS TABLE(id uuid, endpoint text, p256dh text, auth text, title text, body text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  FROM push_subscriptions s WHERE s.enabled = true;
END $$;

CREATE OR REPLACE FUNCTION public.mark_global_reminder_sent()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE notification_settings SET last_sent_date = current_date WHERE id = 1;
END $$;
