CREATE TABLE public.monthly_snapshots (
  month date NOT NULL,
  member_id uuid NOT NULL,
  gym numeric NOT NULL DEFAULT 0,
  deep_work numeric NOT NULL DEFAULT 0,
  sleep numeric NOT NULL DEFAULT 0,
  macros numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month, member_id)
);

GRANT SELECT ON public.monthly_snapshots TO anon, authenticated;
GRANT ALL ON public.monthly_snapshots TO service_role;

ALTER TABLE public.monthly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read monthly_snapshots"
ON public.monthly_snapshots FOR SELECT
USING (true);