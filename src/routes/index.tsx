import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Skull, Crown, Medal } from "lucide-react";
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
      .on("postgres_changes", { event: "*", schema: "public", table: "deep_work_bonuses" }, refresh)
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
      const [members, rules, gym, dw, sleep, macros, freeDays, targets, snapshots] =
        await Promise.all([
          supabase
            .from("members")
            .select("id, name")
            .eq("is_demo", false)
            .eq("is_banned", false),
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
      const { data: dwBonusData } = await supabase
        .from("deep_work_bonuses")
        .select("member_id,date,points")
        .gte("date", ws)
        .lte("date", we);
      return {
        members: members.data ?? [],
        rules: (rules.data ?? []) as Rule[],
        gym: gym.data ?? [],
        dw: dw.data ?? [],
        sleep: sleep.data ?? [],
        macros: macros.data ?? [],
        freeDays: (freeDays.data ?? []).map((f) => f.date),
        targets: targets.data ?? [],
        snapshots: snapshots.data ?? [],
        dwBonuses: (dwBonusData ?? []) as { member_id: string; date: string; points: number }[],
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
      const dwBonusSum = data.dwBonuses
        .filter((b) => b.member_id === m.id)
        .reduce((sum, b) => sum + Number(b.points ?? 0), 0);
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
        deep_work: Number((dwCount * 0.3 + dwBonusSum).toFixed(2)),
        sleep: sleepCount * 0.1,
        macros: macrosDates.size * 0.2,
        total: 0,
      };
      cat.total = sumTotal(cat);
      result.set(m.id, cat);
    }
    return result;
  }, [data, anchor, daysInMonth]);

  const ranked = useMemo(() => {
    if (!data) return [] as { id: string; name: string; total: number; gym: number; deep_work: number; sleep: number; macros: number }[];
    return data.members
      .map((m) => {
        const s = scores.get(m.id) ?? { gym: 0, deep_work: 0, sleep: 0, macros: 0, total: 0 };
        return { id: m.id, name: m.name, ...s };
      })
      .sort((a, b) => b.total - a.total);
  }, [data, scores]);

  const podium = ranked.slice(0, 3);
  const dogshit = ranked.length ? ranked[ranked.length - 1] : null;


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

      {podium.length > 0 && (
        <div className="mb-3 rounded-2xl border border-border bg-card px-3 py-4">
          <div className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Top 3 this month
          </div>
          <div className="grid grid-cols-3 items-end gap-2">
            {(() => {
              const second = podium[1];
              const first = podium[0];
              const third = podium[2];
              const Tier = ({
                m,
                place,
              }: {
                m: { name: string; total: number } | undefined;
                place: 1 | 2 | 3;
              }) => {
                if (!m) return <div />;
                const cfg =
                  place === 1
                    ? {
                        h: "h-24",
                        ring: "border-amber-400/70 bg-amber-400/15",
                        chip: "bg-amber-400/25 text-amber-700 dark:text-amber-300",
                        icon: <Crown className="h-4 w-4 text-amber-500" />,
                        label: "1st",
                      }
                    : place === 2
                      ? {
                          h: "h-16",
                          ring: "border-slate-400/60 bg-slate-400/10",
                          chip: "bg-slate-400/25 text-slate-700 dark:text-slate-200",
                          icon: <Medal className="h-4 w-4 text-slate-400" />,
                          label: "2nd",
                        }
                      : {
                          h: "h-12",
                          ring: "border-orange-500/50 bg-orange-500/10",
                          chip: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
                          icon: <Medal className="h-4 w-4 text-orange-500" />,
                          label: "3rd",
                        };
                return (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="flex items-center gap-1">{cfg.icon}</div>
                    <div className="w-full truncate px-1 text-center text-xs font-semibold">
                      {m.name}
                    </div>
                    <div
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${cfg.chip}`}
                    >
                      {m.total.toFixed(1)}
                    </div>
                    <div
                      className={`flex w-full ${cfg.h} items-start justify-center rounded-t-lg border-x border-t ${cfg.ring} pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}
                    >
                      {cfg.label}
                    </div>
                  </div>
                );
              };
              return (
                <>
                  <Tier m={second} place={2} />
                  <Tier m={first} place={1} />
                  <Tier m={third} place={3} />
                </>
              );
            })()}
          </div>
        </div>
      )}

      {dogshit && (
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
      )}

      {isLoading || !data ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid grid-cols-[2rem_1fr_repeat(5,auto)] items-center gap-x-2 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <div className="text-right">#</div>
            <div></div>
            <div className="w-9 text-right">Gym</div>
            <div className="w-9 text-right">DW</div>
            <div className="w-9 text-right">Sleep</div>
            <div className="w-9 text-right">Macros</div>
            <div className="w-10 text-right text-foreground">Total</div>
          </div>
          <ul className="divide-y divide-border border-t border-border">
            {ranked.map((m, i) => {
              return (
                <li key={m.id}>
                  <Link
                    to="/members/$memberId"
                    params={{ memberId: m.id }}
                    className="grid grid-cols-[2rem_1fr_repeat(5,auto)] items-center gap-x-2 px-4 py-2.5 text-sm tabular-nums transition-colors hover:bg-accent/50"
                  >
                    <div className="text-right text-muted-foreground">{i + 1}</div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{m.name}</span>
                    </div>
                    <div className="w-9 text-right text-muted-foreground">{m.gym.toFixed(1)}</div>
                    <div className="w-9 text-right text-muted-foreground">{m.deep_work.toFixed(1)}</div>
                    <div className="w-9 text-right text-muted-foreground">{m.sleep.toFixed(1)}</div>
                    <div className="w-9 text-right text-muted-foreground">{m.macros.toFixed(1)}</div>
                    <div className="w-10 text-right font-semibold">{m.total.toFixed(1)}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
