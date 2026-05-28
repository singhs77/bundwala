import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSession } from "@/lib/me";
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
type Member = { id: string; name: string };
type MacrosLog = {
  id: string;
  member_id: string;
  date: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

function MacrosPage() {
  const me = useMe();
  const session = useSession();
  const qc = useQueryClient();
  const today = toISODate(new Date());
  const yesterday = toISODate(new Date(Date.now() - 86400000));
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [vals, setVals] = useState<Record<Field, string>>({
    calories: "", protein: "", carbs: "", fat: "", sugar: "", water: "",
  });

  const { data: dayLog } = useQuery({
    queryKey: ["macros-today", me, selectedDate],
    queryFn: async () => {
      const { data } = await supabase.from("macros_logs").select("*").eq("member_id", me!).eq("date", selectedDate).maybeSingle();
      return data;
    },
    enabled: !!me,
  });

  useEffect(() => {
    const next: any = {};
    FIELDS.forEach((f) => (next[f] = dayLog && (dayLog as any)[f] != null ? String((dayLog as any)[f]) : ""));
    setVals(next);
  }, [dayLog, selectedDate]);

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

  const { data: groupRows } = useQuery({
    queryKey: ["macros-group"],
    queryFn: async () => {
      const { data: members, error: membersError } = await supabase
        .from("members")
        .select("id,name");
      if (membersError) throw membersError;

      const { data: logs, error: logsError } = await supabase
        .from("macros_logs")
        .select("id,member_id,date,calories,protein,carbs,fat")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30);
      if (logsError) throw logsError;

      const names = new Map((members ?? []).map((m: Member) => [m.id, m.name]));
      return (logs ?? []).map((log: MacrosLog) => ({
        ...log,
        memberName: names.get(log.member_id) ?? "Unknown",
      }));
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Not signed in");
      const num = (f: Field) => {
        if (vals[f] === "") return null;
        const n = Number(vals[f]);
        if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${f}`);
        return Math.round(n);
      };
      const { error } = await supabase.rpc("log_macros", {
        _token: session.token,
        _date: selectedDate,
        _calories: num("calories"),
        _protein: num("protein"),
        _carbs: num("carbs"),
        _fat: num("fat"),
        _sugar: num("sugar"),
        _water: num("water"),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["macros-today"] });
      qc.invalidateQueries({ queryKey: ["macros-week"] });
      qc.invalidateQueries({ queryKey: ["macros-group"] });
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
        <h2 className="font-semibold">Log macros</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { d: today, label: "Today" },
            { d: yesterday, label: "Yesterday" },
          ].map((o) => (
            <button
              key={o.d}
              onClick={() => setSelectedDate(o.d)}
              className={`rounded-xl py-2 text-xs font-semibold transition ${
                selectedDate === o.d
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-accent"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
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

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Everyone's macro logs</h3>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {groupRows?.length ? groupRows.map((r) => (
            <li key={r.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{r.memberName}</div>
                <div className="text-xs text-muted-foreground">{r.date}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div className="text-sm font-semibold text-foreground tabular-nums">
                  {r.calories ?? "-"} cal
                </div>
                <div className="tabular-nums">
                  P {r.protein ?? "-"} / C {r.carbs ?? "-"} / F {r.fat ?? "-"}
                </div>
              </div>
            </li>
          )) : <li className="p-4 text-center text-sm text-muted-foreground">No macro logs yet.</li>}
        </ul>
      </section>
    </AppShell>
  );
}
