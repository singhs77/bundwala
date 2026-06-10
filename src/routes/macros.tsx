import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSession } from "@/lib/me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startOfMonth, endOfMonth, toISODate, startOfWeek, endOfWeek, formatRange } from "@/lib/week";
import { toast } from "sonner";
import { MemberFeed } from "@/components/app/MemberFeed";

export const Route = createFileRoute("/macros")({
  head: () => ({ meta: [{ title: "Macros — Group Tracker" }] }),
  component: MacrosPage,
});

const REQUIRED_FIELDS = ["calories", "protein", "carbs", "fat"] as const;
const NUMERIC_FIELDS = ["calories", "protein", "carbs", "fat", "sugar"] as const;
const ALL_FIELDS = [...NUMERIC_FIELDS, "water"] as const;
type NumericField = (typeof NUMERIC_FIELDS)[number];
type Field = (typeof ALL_FIELDS)[number];
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
    ALL_FIELDS.forEach((f) => (next[f] = dayLog && (dayLog as any)[f] != null ? String((dayLog as any)[f]) : ""));
    setVals(next);
  }, [dayLog, selectedDate]);

  const ms = toISODate(startOfMonth(new Date()));
  const meMonth = toISODate(endOfMonth(new Date()));

  const { data: myMember } = useQuery({
    queryKey: ["my-member", me],
    queryFn: async () => {
      const { data } = await supabase
        .from("members")
        .select("id,calorie_goal")
        .eq("id", me!)
        .maybeSingle();
      return data;
    },
    enabled: !!me,
  });
  const [goalInput, setGoalInput] = useState<string>("");
  useEffect(() => {
    setGoalInput((myMember as any)?.calorie_goal != null ? String((myMember as any).calorie_goal) : "");
  }, [myMember]);

  const saveGoal = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Not signed in");
      const raw = goalInput.trim();
      const goal = raw === "" ? null : Math.round(Number(raw));
      if (goal != null && (!Number.isFinite(goal) || goal < 0 || goal > 20000)) {
        throw new Error("Invalid goal");
      }
      const { error } = await supabase.rpc("member_set_calorie_goal", {
        _token: session.token,
        _goal: goal,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-member"] });
      qc.invalidateQueries({ queryKey: ["member-logs"] });
      toast.success("Goal saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: weekRows } = useQuery({
    queryKey: ["macros-week-self", me, ws, we],
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

  const { data: monthRows } = useQuery({
    queryKey: ["macros-month-self", me, ms, meMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from("macros_logs")
        .select("*")
        .eq("member_id", me!)
        .gte("date", ms)
        .lte("date", meMonth);
      return data ?? [];
    },
    enabled: !!me,
  });

  const { data: groupRows } = useQuery({
    queryKey: ["macros-month"],
    queryFn: async () => {
      const ms = toISODate(startOfMonth(new Date()));
      const me_ = toISODate(endOfMonth(new Date()));
      const [{ data: members }, { data: logs }] = await Promise.all([
        supabase.from("members").select("id,name"),
        supabase
          .from("macros_logs")
          .select("id,member_id,date,calories,protein,carbs,fat")
          .gte("date", ms)
          .lte("date", me_)
          .order("date", { ascending: false }),
      ]);
      return {
        members: (members ?? []) as Member[],
        logs: (logs ?? []) as MacrosLog[],
      };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Not signed in");
      const num = (f: NumericField) => {
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
        _water: vals.water.trim() === "" ? null : vals.water.trim(),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["macros-today"] });
      qc.invalidateQueries({ queryKey: ["macros-week-self"] });
      qc.invalidateQueries({ queryKey: ["macros-month-self"] });
      qc.invalidateQueries({ queryKey: ["macros-month"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const weekAvgs: Record<NumericField, number> = {} as any;
  NUMERIC_FIELDS.forEach((f) => {
    const vals = (weekRows ?? []).map((r: any) => r[f]).filter((v: any) => v != null) as number[];
    weekAvgs[f] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  });

  const monthAvgs: Record<NumericField, number> = {} as any;
  NUMERIC_FIELDS.forEach((f) => {
    const vals = (monthRows ?? []).map((r: any) => r[f]).filter((v: any) => v != null) as number[];
    monthAvgs[f] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  });

  const logsByMember = useMemo(() => {
    const m = new Map<string, MacrosLog[]>();
    for (const l of groupRows?.logs ?? []) {
      if (!m.has(l.member_id)) m.set(l.member_id, []);
      m.get(l.member_id)!.push(l);
    }
    return m;
  }, [groupRows]);

  function macrosRow(log: MacrosLog | undefined) {
    if (!log || log.calories == null) {
      return (
        <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Not logged
        </span>
      );
    }
    const hit =
      log.calories != null &&
      log.protein != null &&
      log.carbs != null &&
      log.fat != null;
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">{log.calories} cal</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          P {log.protein ?? "-"} / C {log.carbs ?? "-"} / F {log.fat ?? "-"}
        </span>
        {hit && (
          <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
            ✓ Hit
          </span>
        )}
      </div>
    );
  }

  return (
    <AppShell title="Macros">
      <section className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="calorie-goal">Daily calorie goal</Label>
            <Input
              id="calorie-goal"
              inputMode="numeric"
              placeholder="e.g. 2400"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
            />
          </div>
          <Button onClick={() => saveGoal.mutate()} disabled={saveGoal.isPending}>
            Save
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Soon: macros points will require all 4 macros logged AND calories within ±100 of this goal.
        </p>
      </section>

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
          {ALL_FIELDS.map((f) => (
            <div key={f}>
              <Label htmlFor={f} className="capitalize">
                {f}
                {(f === "sugar" || f === "water") && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
                )}
              </Label>
              <Input
                id={f}
                inputMode={f === "water" ? undefined : "numeric"}
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
        <h3 className="text-sm font-semibold text-muted-foreground">This month's averages</h3>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {NUMERIC_FIELDS.map((f) => (
            <div key={f} className="rounded-xl bg-secondary px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{f}</div>
              <div className="text-lg font-bold tabular-nums">{avgs[f]}</div>
            </div>
          ))}
        </div>
      </section>

      <MemberFeed
        title="Everyone's macro logs"
        members={groupRows?.members ?? []}
        renderToday={(mid) => {
          const log = logsByMember.get(mid)?.find((l) => l.date === today);
          return macrosRow(log);
        }}
        renderHistory={(mid) => {
          const rows = logsByMember.get(mid) ?? [];
          if (!rows.length)
            return <p className="text-sm text-muted-foreground">No entries this month.</p>;
          return (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{r.date}</span>
                  {macrosRow(r)}
                </li>
              ))}
            </ul>
          );
        }}
      />
    </AppShell>
  );
}
