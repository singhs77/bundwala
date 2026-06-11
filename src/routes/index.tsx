import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Trophy, Skull } from "lucide-react";
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
import { sumTotal, withinTimeBuffer, type Rule } from "@/lib/score";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PushSettings } from "@/components/app/PushSettings";
import { Announcements } from "@/components/app/Announcements";

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
      const [teams, members, rules, gym, dw, sleep, macros, freeDays, targets, snapshots] =
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
            .select("member_id,date,calories,protein,carbs,fat")
            .gte("date", ws)
            .lte("date", we),
          supabase.from("free_days").select("date").gte("date", ws).lte("date", we),
          supabase.from("sleep_targets").select("*"),
          supabase
            .from("monthly_snapshots")
            .select("member_id,gym,deep_work,sleep,macros")
            .eq("month", ws),
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
        snapshots: snapshots.data ?? [],
      };
    },
  });

  const scores = useMemo(() => {
    if (!data) return new Map<string, { gym: number; deep_work: number; sleep: number; macros: number; total: number }>();
    const result = new Map<string, { gym: number; deep_work: number; sleep: number; macros: number; total: number }>();
    if (data.snapshots.length > 0) {
      const snapMap = new Map(data.snapshots.map((s: any) => [s.member_id, s]));
      for (const m of data.members) {
        const s: any = snapMap.get(m.id);
        const cat = s
          ? {
              gym: Number(s.gym),
              deep_work: Number(s.deep_work),
              sleep: Number(s.sleep),
              macros: Number(s.macros),
              total: 0,
            }
          : { gym: 0, deep_work: 0, sleep: 0, macros: 0, total: 0 };
        cat.total = sumTotal(cat);
        result.set(m.id, cat);
      }
      return result;
    }
    const month = daysOfMonth(anchor).map(toISODate);
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
      // Macros: (daysInMonth / 5) pts per logged day, capped at 5
      const macrosDates = new Set(
        data.macros
          .filter(
            (x) =>
              x.member_id === m.id &&
              x.calories !== null &&
              x.protein !== null &&
              x.carbs !== null &&
              x.fat !== null,
          )
          .map((x) => x.date),
      );
      const cat = {
        gym: gymCount * 0.2,
        deep_work: dwCount * 0.3,
        sleep: sleepCount * 0.1,
        macros: macrosDates.size * 0.2,
        total: 0,
      };
      cat.total = sumTotal(cat);
      result.set(m.id, cat);
    }
    return result;
  }, [data, anchor, daysInMonth]);

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

  const dogshit = useMemo(() => {
    if (!data) return null;
    const freeAgentTeamIds = new Set(
      data.teams.filter((t: any) => /free\s*agent/i.test(t.name)).map((t: any) => t.id),
    );
    let worst: { name: string; total: number } | null = null;
    for (const m of data.members) {
      if (!m.team_id) continue;
      if (freeAgentTeamIds.has(m.team_id)) continue;
      const s = scores.get(m.id);
      if (!s) continue;
      if (!worst || s.total < worst.total) worst = { name: m.name, total: s.total };
    }
    return worst;
  }, [data, scores]);

  const lowestDW = useMemo(() => {
    if (!data) return null;
    const freeAgentTeamIds = new Set(
      data.teams.filter((t: any) => /free\s*agent/i.test(t.name)).map((t: any) => t.id),
    );
    let worst: { name: string; score: number } | null = null;
    for (const m of data.members) {
      if (!m.team_id) continue;
      if (freeAgentTeamIds.has(m.team_id)) continue;
      const s = scores.get(m.id);
      if (!s) continue;
      if (!worst || s.deep_work < worst.score) worst = { name: m.name, score: s.deep_work };
    }
    return worst;
  }, [data, scores]);

  const lowestSleep = useMemo(() => {
    if (!data) return null;
    const freeAgentTeamIds = new Set(
      data.teams.filter((t: any) => /free\s*agent/i.test(t.name)).map((t: any) => t.id),
    );
    let worst: { name: string; score: number } | null = null;
    for (const m of data.members) {
      if (!m.team_id) continue;
      if (freeAgentTeamIds.has(m.team_id)) continue;
      const s = scores.get(m.id);
      if (!s) continue;
      if (!worst || s.sleep < worst.score) worst = { name: m.name, score: s.sleep };
    }
    return worst;
  }, [data, scores]);

  const leastHealthy = useMemo(() => {
    if (!data) return null;
    const freeAgentTeamIds = new Set(
      data.teams.filter((t: any) => /free\s*agent/i.test(t.name)).map((t: any) => t.id),
    );
    let worst: { name: string; score: number; gym: number; macros: number } | null = null;
    for (const m of data.members) {
      if (!m.team_id) continue;
      if (freeAgentTeamIds.has(m.team_id)) continue;
      const s = scores.get(m.id);
      if (!s) continue;
      const avg = (s.gym + s.macros) / 2;
      if (!worst || avg < worst.score) worst = { name: m.name, score: avg, gym: s.gym, macros: s.macros };
    }
    return worst;
  }, [data, scores]);

  const top3 = useMemo(() => {
    if (!data) return [];
    const freeAgentTeamIds = new Set(
      data.teams.filter((t: any) => /free\s*agent/i.test(t.name)).map((t: any) => t.id),
    );
    const arr: { name: string; total: number }[] = [];
    for (const m of data.members) {
      if (!m.team_id) continue;
      if (freeAgentTeamIds.has(m.team_id)) continue;
      const s = scores.get(m.id);
      if (!s) continue;
      arr.push({ name: m.name, total: s.total });
    }
    arr.sort((a, b) => b.total - a.total);
    return arr.slice(0, 3);
  }, [data, scores]);

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

      <div className="mb-3">
        <PushSettings />
      </div>

      <Announcements />

      {dogshit && (
        <>
          <div className="mb-3 flex items-center justify-between rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <Skull className="h-4 w-4 text-destructive" />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
                  Most Dogshit Player
                </div>
                <div className="text-sm font-semibold">{dogshit.name}</div>
              </div>
            </div>
            <div className="rounded-full bg-background/60 px-3 py-1 text-sm font-bold tabular-nums">
              {dogshit.total.toFixed(1)}
            </div>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {lowestDW && (
              <div className="flex flex-col gap-1 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Lowest deepwork
                </div>
                <div className="text-xs font-semibold truncate">{lowestDW.name}</div>
                <div className="self-start rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-700 dark:text-amber-300">
                  {lowestDW.score.toFixed(1)}
                </div>
              </div>
            )}
            {lowestSleep && (
              <div className="flex flex-col gap-1 rounded-2xl border border-sky-500/40 bg-sky-500/10 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  Lowest sleep
                </div>
                <div className="text-xs font-semibold truncate">{lowestSleep.name}</div>
                <div className="self-start rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-bold tabular-nums text-sky-700 dark:text-sky-300">
                  {lowestSleep.score.toFixed(1)}
                </div>
              </div>
            )}
            {leastHealthy && (
              <div className="flex flex-col gap-1 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Least healthy
                </div>
                <div className="text-xs font-semibold truncate">{leastHealthy.name}</div>
                <div className="self-start rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {leastHealthy.score.toFixed(1)}
                </div>
              </div>
            )}
          </div>
          {top3.length > 0 && (
            <div className="mb-3 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <div className="text-[11px] font-semibold uppercase tracking-wider text-yellow-700 dark:text-yellow-400">
                  Top 3 highest scores
                </div>
              </div>
              <div className="space-y-1.5">
                {top3.map((p, i) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <div key={p.name + i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span>{medals[i]}</span>
                        <span>{p.name}</span>
                      </div>
                      <div className="rounded-full bg-yellow-500/20 px-3 py-0.5 text-sm font-bold tabular-nums text-yellow-700 dark:text-yellow-300">
                        {p.total.toFixed(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

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
                      <li key={m.id}>
                        <Link
                          to="/members/$memberId"
                          params={{ memberId: m.id }}
                          className="grid grid-cols-[1fr_repeat(5,auto)] items-center gap-x-2 px-4 py-2.5 text-sm tabular-nums transition-colors hover:bg-accent/50"
                        >
                          <div className="truncate font-medium">{m.name}</div>
                          <div className="w-9 text-right text-muted-foreground">{s.gym.toFixed(1)}</div>
                          <div className="w-9 text-right text-muted-foreground">{s.deep_work.toFixed(1)}</div>
                          <div className="w-9 text-right text-muted-foreground">{s.sleep.toFixed(1)}</div>
                          <div className="w-9 text-right text-muted-foreground">{s.macros.toFixed(1)}</div>
                          <div className="w-10 text-right font-semibold">{s.total.toFixed(1)}</div>
                        </Link>
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
