ALTER TABLE public.sleep_targets ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.member_set_sleep_target(_token uuid, _sleep time, _wake time)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _mid uuid; _existing_updated timestamptz; _unlock date;
BEGIN
  _mid := _member_from_token(_token);
  IF _sleep IS NULL OR _wake IS NULL THEN RAISE EXCEPTION 'bad_value'; END IF;
  SELECT updated_at INTO _existing_updated FROM sleep_targets WHERE member_id = _mid;
  IF _existing_updated IS NOT NULL AND _existing_updated > now() - interval '1 month' THEN
    _unlock := (_existing_updated + interval '1 month')::date;
    RAISE EXCEPTION 'target_locked:%', _unlock;
  END IF;
  INSERT INTO sleep_targets(member_id, target_sleep, target_wake, updated_at)
  VALUES (_mid, _sleep, _wake, now())
  ON CONFLICT (member_id) DO UPDATE
    SET target_sleep = EXCLUDED.target_sleep,
        target_wake = EXCLUDED.target_wake,
        updated_at = now();
END $$;