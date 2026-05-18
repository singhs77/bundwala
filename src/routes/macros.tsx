import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { endOfWeek, startOfWeek, toISODate } from "@/lib/week";
import { toast } from "sonner";

export const Route = createFileRoute("/macros")({
  head: () => ({ meta: [{ title: "Macros — Group Tracker" }] }),
  component: MacrosPage,
});

const FIELDS = ["calories", "protein", "carbs", "fat", "sugar", "water"] as const;
type Field = (typeof FIELDS)[number];

function MacrosPage() {
  const me = useMe();
  const qc = useQueryClient();
  const today = toISODate(new Date());
  const [vals, setVals] = useState<Record<Field, string>>({
    calories: "", protein: "", carbs: "", fat: "", sugar: "", water: "",
  });

  const { data: todayLog } = useQuery({
    queryKey: ["macros-today", me, today],
    queryFn: async () => {
      const { data } = await supabase.from("macros_logs").select("*").eq("member_id", me!).eq("date", today).maybeSingle();
      return data;
    },
    enabled: !!me,
  });

  useEffect(() => {
    if (todayLog) {
      const next: any = {};
      FIELDS.forEach((f) => (next[f] = todayLog[f] != null ? String(todayLog[f]) : ""));
      setVals(next);
    }
  }, [todayLog]);

  const ws = toISODate(startOfWeek(new Date()));
  const we = toISODate(endOfWeek(new Date()));
  const { data: weekRows } = useQuery({
    queryKey: ["macros-week", me, ws, we],
    queryFn: async () => {
      const { data } = await supabase
        .from("macros_logs")
        .select("*")
        .eq("member_id", me!)
        .gte("date", ws)
        .lte("date", we);
      return data ?? [];
    },
    enabled: !!me,
  });

  const save = useMutation({
    mutationFn: async () => {
      const row: any = { member_id: me!, date: today };
      FIELDS.forEach((f) => (row[f] = vals[f] === "" ? null : Number(vals[f])));
      const { error } = await supabase.from("macros_logs").upsert(row, { onConflict: "member_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["macros-today"] });
      qc.invalidateQueries({ queryKey: ["macros-week"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const avgs: Record<Field, number> = {} as any;
  FIELDS.forEach((f) => {
    const vals = (weekRows ?? []).map((r: any) => r[f]).filter((v: any) => v != null) as number[];
    avgs[f] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  });

  return (
    <AppShell title="Macros">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Log today</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f}>
              <Label htmlFor={f} className="capitalize">{f}</Label>
              <Input
                id={f}
                inputMode="numeric"
                value={vals[f]}
                onChange={(e) => setVals((v) => ({ ...v, [f]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={() => save.mutate()} disabled={save.isPending}>
          Save
        </Button>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground">This week's averages</h3>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {FIELDS.map((f) => (
            <div key={f} className="rounded-xl bg-secondary px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{f}</div>
              <div className="text-lg font-bold tabular-nums">{avgs[f]}</div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
