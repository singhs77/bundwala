import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle, Crown } from "lucide-react";
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
      // Macros: 0.2 pts per fully-logged day, no cap
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
      {/* Month Navigation */}
      <nav className="mb-4 flex items-center justify-between rounded-xl border border-border bg-card/50 p-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-lg"
          onClick={() => setAnchor((d) => shiftMonth(d, -1))}
        >
          <ChevronLeft className="h-5 w-5 text-muted-foreground" />
        </Button>
        <span className="text-sm font-medium uppercase tracking-widest text-foreground">
          {formatMonth(anchor)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-lg"
          onClick={() => setAnchor((d) => shiftMonth(d, 1))}
        >
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Button>
      </nav>

      <div className="mb-3">
        <PushSettings />
      </div>

      <Announcements />

      {/* Most Dogshit Player Callout */}
      {dogshit && (
        <div className="relative mb-4 flex items-center gap-4 overflow-hidden rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
          <div className="rounded-xl bg-destructive/20 p-3">
            <AlertTriangle className="h-7 w-7 text-destructive" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-tighter text-destructive/80">
              Most Dogshit Player
            </p>
            <h3 className="truncate text-xl font-black uppercase tracking-tight text-destructive">
              {dogshit.name}
            </h3>
            <p className="text-xs text-destructive/70">
              {dogshit.total.toFixed(1)} pts · Needs work on: {" "}
              {(
                [
                  ["gym", dogshit.gym],
                  ["deep_work", dogshit.deep_work],
                  ["sleep", dogshit.sleep],
                  ["macros", dogshit.macros],
                ] as [string, number][]
              )
                .sort((a, b) => a[1] - b[1])[0][0]
                .replace("deep_work", "deep work")
                .replace("macros", "macros")}
            </p>
          </div>
        </div>
      )}

      {/* Top 3 Podium */}
      {podium.length > 0 && (
        <div className="mb-2 flex items-end justify-center gap-2 px-2 pb-1 pt-8">
          {(() => {
            const Tier = ({
              m,
              place,
            }: {
              m: { name: string; total: number } | undefined;
              place: 1 | 2 | 3;
            }) => {
              if (!m) return <div className="flex-1" />;
              const cfg =
                place === 1
                  ? {
                      bar: "h-32 rounded-t-xl bg-card border-x border-t border-amber-500/40",
                      ring: "h-16 w-16 border-amber-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]",
                      ringText: "text-amber-500",
                      badge: "bg-amber-500 w-6 h-6 text-base",
                      label: "1",
                      score: "text-2xl text-amber-500",
                      scale: "scale-110",
                      crown: true,
                    }
                  : place === 2
                    ? {
                        bar: "h-24 rounded-t-lg bg-card/60 border-x border-t border-border",
                        ring: "h-14 w-14 border-slate-400",
                        ringText: "text-slate-400",
                        badge: "bg-slate-400 w-5 h-5 text-[10px]",
                        label: "2",
                        score: "text-lg text-slate-400",
                        scale: "",
                        crown: false,
                      }
                    : {
                        bar: "h-20 rounded-t-lg bg-card/60 border-x border-t border-border",
                        ring: "h-14 w-14 border-orange-700",
                        ringText: "text-orange-700 dark:text-orange-500",
                        badge: "bg-orange-700 w-5 h-5 text-[10px]",
                        label: "3",
                        score: "text-lg text-orange-700 dark:text-orange-500",
                        scale: "",
                        crown: false,
                      };
              const initials = m.name
                .split(" ")
                .map((s) => s[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              return (
                <div className="flex flex-1 flex-col items-center">
                  <div className={`relative mb-2 ${cfg.scale}`}>
                    {cfg.crown && (
                      <Crown className="absolute -top-5 left-1/2 h-5 w-5 -translate-x-1/2 text-amber-500" />
                    )}
                    <div
                      className={`flex items-center justify-center overflow-hidden rounded-full border-2 bg-muted ${cfg.ring}`}
                    >
                      <span className={`font-bold ${cfg.ringText}`}>{initials}</span>
                    </div>
                    <div
                      className={`absolute -bottom-1 -right-1 flex items-center justify-center rounded-full border-2 border-background font-bold text-background ${cfg.badge}`}
                    >
                      {cfg.label}
                    </div>
                  </div>
                  <div
                    className={`flex w-full flex-col items-center justify-center ${cfg.bar}`}
                  >
                    <span className="truncate px-1 text-xs font-bold text-foreground">
                      {m.name}
                    </span>
                    <span className={`font-black tabular-nums ${cfg.score}`}>
                      {m.total.toFixed(1)}
                    </span>
                  </div>
                </div>
              );
            };
            return (
              <>
                <Tier m={podium[1]} place={2} />
                <Tier m={podium[0]} place={1} />
                <Tier m={podium[2]} place={3} />
              </>
            );
          })()}
        </div>
      )}

      {/* Leaderboard Table */}
      {isLoading || !data ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid grid-cols-[2rem_1fr_repeat(5,auto)] items-center gap-x-2 bg-card/50 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <div className="text-right">#</div>
            <div>Player</div>
            <div className="w-9 text-center">GYM</div>
            <div className="w-9 text-center">DW</div>
            <div className="w-9 text-center">SL</div>
            <div className="w-9 text-center">MC</div>
            <div className="w-10 text-right text-foreground">TOT</div>
          </div>
          <ul className="divide-y divide-border">
            {ranked.map((m, i) => {
              return (
                <li key={m.id} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                  <Link
                    to="/members/$memberId"
                    params={{ memberId: m.id }}
                    className="grid grid-cols-[2rem_1fr_repeat(5,auto)] items-center gap-x-2 px-4 py-3 text-sm tabular-nums transition-colors hover:bg-accent/40"
                  >
                    <div className="text-right text-xs font-bold text-muted-foreground">{i + 1}</div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold">{m.name}</span>
                    </div>
                    <div className="w-9 text-center text-xs text-muted-foreground">{m.gym.toFixed(1)}</div>
                    <div className="w-9 text-center text-xs text-muted-foreground">{m.deep_work.toFixed(1)}</div>
                    <div className="w-9 text-center text-xs text-muted-foreground">{m.sleep.toFixed(1)}</div>
                    <div className="w-9 text-center text-xs text-muted-foreground">{m.macros.toFixed(1)}</div>
                    <div className="w-10 text-right text-sm font-black text-foreground">{m.total.toFixed(1)}</div>
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
