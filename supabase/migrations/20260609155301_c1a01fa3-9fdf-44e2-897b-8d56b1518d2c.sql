-- Dedupe existing deep_work rows: keep latest created_at per (member_id, date)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY member_id, date ORDER BY created_at DESC) AS rn
  FROM deep_work
),
losers AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM dw_comments WHERE deep_work_id IN (SELECT id FROM losers);

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY member_id, date ORDER BY created_at DESC) AS rn
  FROM deep_work
)
DELETE FROM deep_work WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Enforce 1 per day per member
ALTER TABLE public.deep_work
  ADD CONSTRAINT deep_work_member_date_unique UNIQUE (member_id, date);

-- Upsert behavior: re-logging same day replaces the entry (drops old comments)
CREATE OR REPLACE FUNCTION public.log_deep_work(_token uuid, _date date, _topic text, _minutes integer, _learnings text, _personal_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _mid uuid; _id uuid; _existing uuid; _started timestamptz; _finished timestamptz;
BEGIN
  _mid := _member_from_token(_token);
  IF _date > current_date OR _date < current_date - interval '180 days' THEN RAISE EXCEPTION 'bad_date'; END IF;
  IF _minutes IS NOT NULL AND (_minutes < 1 OR _minutes > 600) THEN RAISE EXCEPTION 'bad_minutes'; END IF;
  IF _topic IS NOT NULL AND length(_topic) > 200 THEN RAISE EXCEPTION 'topic_too_long'; END IF;
  IF length(coalesce(_learnings,'')) > 5000 OR length(coalesce(_personal_notes,'')) > 5000 THEN RAISE EXCEPTION 'text_too_long'; END IF;
  _finished := now();
  _started  := _finished - (coalesce(_minutes,0) * interval '1 minute');

  SELECT id INTO _existing FROM deep_work WHERE member_id = _mid AND date = _date;
  IF _existing IS NOT NULL THEN
    DELETE FROM dw_comments WHERE deep_work_id = _existing;
    UPDATE deep_work
      SET topic = nullif(trim(coalesce(_topic,'')),''),
          minutes = _minutes,
          started_at = _started,
          finished_at = _finished,
          learnings = nullif(_learnings,''),
          personal_notes = nullif(_personal_notes,'')
      WHERE id = _existing
      RETURNING id INTO _id;
  ELSE
    INSERT INTO deep_work(member_id, date, topic, minutes, started_at, finished_at, learnings, personal_notes)
    VALUES (_mid, _date, nullif(trim(coalesce(_topic,'')),''), _minutes, _started, _finished,
            nullif(_learnings,''), nullif(_personal_notes,''))
    RETURNING id INTO _id;
  END IF;
  RETURN _id;
END $function$;