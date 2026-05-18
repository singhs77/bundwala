CREATE OR REPLACE FUNCTION public.member_set_team(_token uuid, _team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM teams WHERE id = _team_id) THEN
    RAISE EXCEPTION 'team_not_found';
  END IF;
  UPDATE members SET team_id = _team_id WHERE id = _mid;
END $$;