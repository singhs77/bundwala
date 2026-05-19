CREATE OR REPLACE FUNCTION public.delete_sleep(_token uuid, _date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  DELETE FROM sleep_logs WHERE member_id = _mid AND date = _date;
END $function$;