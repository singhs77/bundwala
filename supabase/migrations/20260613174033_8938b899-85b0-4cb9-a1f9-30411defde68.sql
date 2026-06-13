
-- 1. deep_work_bonuses table
CREATE TABLE public.deep_work_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  date date NOT NULL,
  points numeric NOT NULL DEFAULT 0.3,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, date, reason)
);

GRANT SELECT ON public.deep_work_bonuses TO anon, authenticated;
GRANT ALL ON public.deep_work_bonuses TO service_role;

ALTER TABLE public.deep_work_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read deep_work_bonuses"
  ON public.deep_work_bonuses FOR SELECT
  USING (true);

-- 2. activity_audit table
CREATE TABLE public.activity_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid,
  table_name text NOT NULL,
  action text NOT NULL,
  row_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_audit_member_created_idx
  ON public.activity_audit (member_id, created_at DESC);
CREATE INDEX activity_audit_table_created_idx
  ON public.activity_audit (table_name, created_at DESC);

GRANT SELECT ON public.activity_audit TO anon, authenticated;
GRANT ALL ON public.activity_audit TO service_role;

ALTER TABLE public.activity_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read activity_audit"
  ON public.activity_audit FOR SELECT
  USING (true);

-- 3. audit trigger function
CREATE OR REPLACE FUNCTION public.log_activity_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mid uuid;
  _rid uuid;
  _payload jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _mid := OLD.member_id;
    _rid := OLD.id;
    _payload := to_jsonb(OLD);
  ELSE
    _mid := NEW.member_id;
    _rid := NEW.id;
    _payload := to_jsonb(NEW);
  END IF;

  INSERT INTO public.activity_audit (member_id, table_name, action, row_id, payload)
  VALUES (_mid, TG_TABLE_NAME, TG_OP, _rid, _payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. attach triggers
CREATE TRIGGER audit_gym_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.gym_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

CREATE TRIGGER audit_sleep_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.sleep_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

CREATE TRIGGER audit_macros_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.macros_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

CREATE TRIGGER audit_deep_work
  AFTER INSERT OR UPDATE OR DELETE ON public.deep_work
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

-- 5. seed free deep-work bonus for Baby GL, Twin GL, Dr GL for today
INSERT INTO public.deep_work_bonuses (member_id, date, points, reason)
VALUES
  ('5b4e5830-7f5d-417e-9086-7c489b5907ae', '2026-06-13', 0.3, 'manual_free_day'),
  ('3f45c2b7-c444-42f9-a8cc-8e18bf13c74f', '2026-06-13', 0.3, 'manual_free_day'),
  ('adeec72c-e7e1-4110-9d93-335387218e68', '2026-06-13', 0.3, 'manual_free_day')
ON CONFLICT (member_id, date, reason) DO NOTHING;
