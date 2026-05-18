CREATE OR REPLACE FUNCTION public.delete_deep_work(_token uuid, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _mid uuid; _owner uuid;
BEGIN
  _mid := _member_from_token(_token);
  SELECT member_id INTO _owner FROM deep_work WHERE id = _id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _owner <> _mid THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM dw_comments WHERE deep_work_id = _id;
  DELETE FROM deep_work WHERE id = _id;
END $function$;