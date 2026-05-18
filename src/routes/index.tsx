import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  daysOfMonth,
  endOfMonth,
  formatMonth,
  shiftMonth,
  startOfMonth,
  toISODate,
} from "@/lib/week";
import { applyCap, sumTotal, withinTimeBuffer, type Rule } from "@/lib/score";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Standings — Group Tracker" }],
  }),
  component: Leaderboard,
});

function Leaderboard() {
  const [anchor, setAnchor] = useState(() => new Date());
  const ws = useMemo(() => toISODate(startOfMonth(anchor)), [anchor]);
  const we = useMemo(() => toISODate(endOfMonth(anchor)), [anchor]);
  const daysInMonth = useMemo(() => daysOfMonth(anchor).length, [anchor]);
  const capScale = useMemo(() => daysInMonth / 7, [daysInMonth]);
  const [openTeams, setOpenTeams] = useState<Record<string, boolean>>({});
  const qc = useQueryClient();

  // Realtime: refresh standings whenever any activity changes
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["leaderboard"] });
      }, 400);
    };
    const channel = supabase
      .channel("standings-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "gym_logs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sleep_logs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "macros_logs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "deep_work" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "free_days" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, refresh)
      .subscribe();
    return () => {
      if (pending) clearTimeout(pending);
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", ws, we],
    queryFn: async () => {
      const [teams, members, rules, gym, dw, sleep, macros, freeDays, targets] =
        await Promise.all([
          supabase.from("teams").select("*").order("sort_order"),
          supabase.from("members").select("id, name, team_id"),
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
            .select("member_id,date,hours,free_day,sleep_time,wake_time")
            .gte("date", ws)
            .lte("date", we),
          supabase
            .from("macros_logs")
            .select("member_id,date,calories")
            .gte("date", ws)
            .lte("date", we),
          supabase.from("free_days").select("date").gte("date", ws).lte("date", we),
          supabase.from("sleep_targets").select("*"),
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
        targets: targets.data ?? [],
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
    const month = daysOfMonth(anchor).map(toISODate);
    const result = new Map<string, { gym: number; deep_work: number; sleep: number; macros: number; total: number }>();
    for (const m of data.members) {
      const gymCount = data.gym.filter(
        (g) => g.member_id === m.id && (g.status === "yes" || g.status === "home"),
      ).length;
      const dwCount = data.dw.filter((d) => d.member_id === m.id).length;
      // Sleep: count days where hit (>=7h) OR was a free day, but only days where they had entry or free day
      const sleepCount = month.filter((d) => {
        if (data.freeDays.includes(d)) return true;
        const s = data.sleep.find((x) => x.member_id === m.id && x.date === d);
        if (!s) return false;
        if (s.free_day) return true;
        const t = data.targets.find((x: any) => x.member_id === m.id);
        if (t?.target_sleep && t?.target_wake) {
          return (
            withinTimeBuffer(s.sleep_time, t.target_sleep, 90) &&
            withinTimeBuffer(s.wake_time, t.target_wake, 90)
          );
        }
        return Number(s.hours ?? 0) >= 7;
      }).length;
      const macrosCount = data.macros.filter(
        (x) => x.member_id === m.id && x.calories !== null,
      ).length;
      const scaleRule = (r?: Rule): Rule | undefined =>
        r ? { ...r, weekly_cap: Number(r.weekly_cap) * capScale } : r;
      const cat = {
        gym: applyCap(gymCount, scaleRule(ruleMap.get("gym"))),
        deep_work: applyCap(dwCount, scaleRule(ruleMap.get("deep_work"))),
        sleep: applyCap(sleepCount, scaleRule(ruleMap.get("sleep"))),
        macros: applyCap(macrosCount, scaleRule(ruleMap.get("macros"))),
        total: 0,
      };
      cat.total = sumTotal(cat);
      result.set(m.id, cat);
    }
    return result;
  }, [data, ruleMap, anchor, capScale]);

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
        <Button variant="ghost" size="icon" onClick={() => setAnchor((d) => shiftMonth(d, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium">{formatMonth(anchor)}</div>
        <Button variant="ghost" size="icon" onClick={() => setAnchor((d) => shiftMonth(d, 1))}>
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
            const isOpen = openTeams[t.id] ?? false;
            return (
              <Collapsible
                key={t.id}
                open={isOpen}
                onOpenChange={(o) => setOpenTeams((prev) => ({ ...prev, [t.id]: o }))}
                className={`overflow-hidden rounded-2xl border bg-card ${
                  isLeader ? "border-primary/60 shadow-[0_0_0_1px_var(--color-primary)]" : "border-border"
                }`}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      {isLeader && <Trophy className="h-4 w-4 text-primary" />}
                      <h2 className="text-base font-semibold">{t.name}</h2>
                      <span className="text-xs text-muted-foreground">
                        {teamMembers.length} {teamMembers.length === 1 ? "member" : "members"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-secondary px-3 py-1 text-sm font-bold tabular-nums">
                        {total.toFixed(1)}
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-[1fr_repeat(5,auto)] items-center gap-x-2 gap-y-1 px-4 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
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
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
