CREATE TABLE public.sobriety_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  date date NOT NULL,
  weed boolean,
  liquor boolean,
  vape boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, date)
);
GRANT SELECT ON public.sobriety_logs TO anon, authenticated;
GRANT ALL ON public.sobriety_logs TO service_role;
ALTER TABLE public.sobriety_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read sobriety_logs" ON public.sobriety_logs FOR SELECT USING (true);

CREATE TRIGGER audit_sobriety_logs AFTER INSERT OR UPDATE OR DELETE ON public.sobriety_logs
FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

CREATE OR REPLACE FUNCTION public.log_sobriety(_token uuid, _date date, _substance text, _used boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _mid uuid;
BEGIN
  _mid := _member_from_token(_token);
  IF _substance NOT IN ('weed','liquor','vape') THEN RAISE EXCEPTION 'bad_value'; END IF;
  -- today/yesterday in member's local time; UTC server so allow 1 day slack
  IF _date > current_date + 1 OR _date < current_date - 2 THEN RAISE EXCEPTION 'bad_date'; END IF;
  INSERT INTO sobriety_logs(member_id, date) VALUES (_mid, _date) ON CONFLICT (member_id, date) DO NOTHING;
  EXECUTE format('UPDATE sobriety_logs SET %I = $1 WHERE member_id = $2 AND date = $3', _substance)
    USING _used, _mid, _date;
END $$;
GRANT EXECUTE ON FUNCTION public.log_sobriety(uuid, date, text, boolean) TO anon, authenticated;