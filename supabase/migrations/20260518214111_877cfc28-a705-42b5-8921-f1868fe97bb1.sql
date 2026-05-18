CREATE TABLE public.baseline_scores (
  member_id uuid PRIMARY KEY,
  gym numeric NOT NULL DEFAULT 0,
  macros numeric NOT NULL DEFAULT 0,
  deep_work numeric NOT NULL DEFAULT 0,
  sleep numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.baseline_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read baseline_scores"
ON public.baseline_scores FOR SELECT TO public USING (true);