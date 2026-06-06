ALTER TABLE public.macros_logs ALTER COLUMN water TYPE text USING water::text;

CREATE OR REPLACE FUNCTION public.log_macros(_token uuid, _date date, _calories integer, _protein integer, _carbs integer, _fat integer, _sugar integer, _water text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _date > current_date OR _date < current_date - interval '180 days' THEN RAISE EXCEPTION 'bad_date'; END IF;
  IF (_calories IS NOT NULL AND (_calories < 0 OR _calories > 20000))
   OR (_protein  IS NOT NULL AND (_protein  < 0 OR _protein  > 2000))
   OR (_carbs    IS NOT NULL AND (_carbs    < 0 OR _carbs    > 2000))
   OR (_fat      IS NOT NULL AND (_fat      < 0 OR _fat      > 2000))
   OR (_sugar    IS NOT NULL AND (_sugar    < 0 OR _sugar    > 2000)) THEN
    RAISE EXCEPTION 'bad_value';
  END IF;
  IF _water IS NOT NULL AND length(_water) > 200 THEN RAISE EXCEPTION 'bad_water'; END IF;
  INSERT INTO macros_logs(member_id, date, calories, protein, carbs, fat, sugar, water)
  VALUES (_mid, _date, _calories, _protein, _carbs, _fat, _sugar, _water)
  ON CONFLICT (member_id, date) DO UPDATE
  SET calories=EXCLUDED.calories, protein=EXCLUDED.protein, carbs=EXCLUDED.carbs,
      fat=EXCLUDED.fat, sugar=EXCLUDED.sugar, water=EXCLUDED.water;
END $function$;