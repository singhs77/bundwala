ALTER TABLE public.members ADD COLUMN IF NOT EXISTS calorie_goal int;

CREATE OR REPLACE FUNCTION public.member_set_calorie_goal(_token uuid, _goal int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _goal IS NOT NULL AND (_goal < 0 OR _goal > 20000) THEN
    RAISE EXCEPTION 'bad_goal';
  END IF;
  UPDATE members SET calorie_goal = _goal WHERE id = _mid;
END $$;

REVOKE ALL ON FUNCTION public.member_set_calorie_goal(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_set_calorie_goal(uuid, int) TO authenticated, anon;