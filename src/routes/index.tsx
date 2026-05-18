import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  daysOfWeek,
  endOfWeek,
  formatRange,
  shiftWeek,
  startOfWeek,
  toISODate,
} from "@/lib/week";
import { applyCap, sumTotal, type Rule } from "@/lib/score";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Standings — Group Tracker" }],
  }),
  component: Leaderboard,
});

function Leaderboard() {
  const [anchor, setAnchor] = useState(() => new Date());
  const ws = useMemo(() => toISODate(startOfWeek(anchor)), [anchor]);
  const we = useMemo(() => toISODate(endOfWeek(anchor)), [anchor]);

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", ws, we],
    queryFn: async () => {
      const [teams, members, rules, gym, dw, sleep, macros, freeDays] =
        await Promise.all([
          supabase.from("teams").select("*").order("sort_order"),
          supabase.from("members").select("*"),
          supabase.from("scoring_rules").select("*"),
          supabase
            .from("gym_logs")
            .select("member_id,status,date")
            .gte("date", ws)
            .lte("date", we),
          supabase
            .from("deep_work")
            .select("member_id,date")
            .gte("date", ws)
            .lte("date", we),
          supabase
            .from("sleep_logs")
            .select("member_id,date,hours,free_day")
            .gte("date", ws)
            .lte("date", we),
          supabase
            .from("macros_logs")
            .select("member_id,date,calories")
            .gte("date", ws)
            .lte("date", we),
          supabase.from("free_days").select("date").gte("date", ws).lte("date", we),
        ]);
      return {
        teams: teams.data ?? [],
        members: members.data ?? [],
        rules: (rules.data ?? []) as Rule[],
        gym: gym.data ?? [],
        dw: dw.data ?? [],
        sleep: sleep.data ?? [],
        macros: macros.data ?? [],
        freeDays: (freeDays.data ?? []).map((f) => f.date),
      };
    },
  });

  const ruleMap = useMemo(() => {
    const m = new Map<string, Rule>();
    data?.rules.forEach((r) => m.set(r.category, r));
    return m;
  }, [data?.rules]);

  const scores = useMemo(() => {
    if (!data) return new Map<string, { gym: number; deep_work: number; sleep: number; macros: number; total: number }>();
    const week = daysOfWeek(anchor).map(toISODate);
    const result = new Map<string, { gym: number; deep_work: number; sleep: number; macros: number; total: number }>();
    for (const m of data.members) {
      const gymCount = data.gym.filter(
        (g) => g.member_id === m.id && (g.status === "yes" || g.status === "home"),
      ).length;
      const dwCount = data.dw.filter((d) => d.member_id === m.id).length;
      // Sleep: count days where hit (>=7h) OR was a free day, but only days where they had entry or free day
      const sleepCount = week.filter((d) => {
        if (data.freeDays.includes(d)) return true;
        const s = data.sleep.find((x) => x.member_id === m.id && x.date === d);
        if (!s) return false;
        if (s.free_day) return true;
        return Number(s.hours ?? 0) >= 7;
      }).length;
      const macrosCount = data.macros.filter(
        (x) => x.member_id === m.id && x.calories !== null,
      ).length;
      const cat = {
        gym: applyCap(gymCount, ruleMap.get("gym")),
        deep_work: applyCap(dwCount, ruleMap.get("deep_work")),
        sleep: applyCap(sleepCount, ruleMap.get("sleep")),
        macros: applyCap(macrosCount, ruleMap.get("macros")),
        total: 0,
      };
      cat.total = sumTotal(cat);
      result.set(m.id, cat);
    }
    return result;
  }, [data, ruleMap, anchor]);

  const teamTotals = useMemo(() => {
    if (!data) return new Map<string, number>();
    const totals = new Map<string, number>();
    for (const t of data.teams) totals.set(t.id, 0);
    for (const m of data.members) {
      if (!m.team_id) continue;
      const s = scores.get(m.id);
      if (!s) continue;
      totals.set(m.team_id, Number(((totals.get(m.team_id) ?? 0) + s.total).toFixed(2)));
    }
    return totals;
  }, [data, scores]);

  const leaderTeamId = useMemo(() => {
    let max = -1;
    let id: string | null = null;
    teamTotals.forEach((v, k) => {
      if (v > max) {
        max = v;
        id = k;
      }
    });
    return id;
  }, [teamTotals]);

  return (
    <AppShell title="Standings">
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card p-3">
        <Button variant="ghost" size="icon" onClick={() => setAnchor((d) => shiftWeek(d, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium">Week of {formatRange(anchor)}</div>
        <Button variant="ghost" size="icon" onClick={() => setAnchor((d) => shiftWeek(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {data.teams.map((t) => {
            const teamMembers = data.members.filter((m) => m.team_id === t.id);
            const total = teamTotals.get(t.id) ?? 0;
            const isLeader = t.id === leaderTeamId && total > 0;
            return (
              <section
                key={t.id}
                className={`overflow-hidden rounded-2xl border bg-card ${
                  isLeader ? "border-primary/60 shadow-[0_0_0_1px_var(--color-primary)]" : "border-border"
                }`}
              >
                <header className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    {isLeader && <Trophy className="h-4 w-4 text-primary" />}
                    <h2 className="text-base font-semibold">{t.name}</h2>
                  </div>
                  <div className="rounded-full bg-secondary px-3 py-1 text-sm font-bold tabular-nums">
                    {total.toFixed(1)}
                  </div>
                </header>
                <div className="grid grid-cols-[1fr_repeat(5,auto)] items-center gap-x-2 gap-y-1 px-4 pb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <div></div>
                  <div className="w-9 text-right">Gym</div>
                  <div className="w-9 text-right">DW</div>
                  <div className="w-9 text-right">Sleep</div>
                  <div className="w-9 text-right">Macros</div>
                  <div className="w-10 text-right text-foreground">Total</div>
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {teamMembers.map((m) => {
                    const s = scores.get(m.id) ?? { gym: 0, deep_work: 0, sleep: 0, macros: 0, total: 0 };
                    return (
                      <li
                        key={m.id}
                        className="grid grid-cols-[1fr_repeat(5,auto)] items-center gap-x-2 px-4 py-2.5 text-sm tabular-nums"
                      >
                        <div className="truncate font-medium">{m.name}</div>
                        <div className="w-9 text-right text-muted-foreground">{s.gym.toFixed(1)}</div>
                        <div className="w-9 text-right text-muted-foreground">{s.deep_work.toFixed(1)}</div>
                        <div className="w-9 text-right text-muted-foreground">{s.sleep.toFixed(1)}</div>
                        <div className="w-9 text-right text-muted-foreground">{s.macros.toFixed(1)}</div>
                        <div className="w-10 text-right font-semibold">{s.total.toFixed(1)}</div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
