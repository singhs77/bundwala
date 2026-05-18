import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowLeft, Check, X } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  addDays,
  daysOfMonth,
  endOfMonth,
  formatMonth,
  saturdaysInMonth,
  shiftMonth,
  startOfMonth,
  toISODate,
} from "@/lib/week";
import { withinTimeBuffer } from "@/lib/score";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/member/$memberId")({
  head: () => ({ meta: [{ title: "Breakdown — Group Tracker" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    month: typeof s.month === "string" ? s.month : undefined,
  }),
  component: MemberBreakdown,
});

function MemberBreakdown() {
  const { memberId } = Route.useParams();
  const { month } = Route.useSearch();
  const [anchor, setAnchor] = useState(() => (month ? new Date(month + "T00:00:00") : new Date()));
  const ws = useMemo(() => toISODate(startOfMonth(anchor)), [anchor]);
  const we = useMemo(() => toISODate(endOfMonth(anchor)), [anchor]);

  const { data, isLoading } = useQuery({
    queryKey: ["member-breakdown", memberId, ws, we],
    queryFn: async () => {
      const [member, gym, dw, sleep, macros, freeDays, targets, baseline] = await Promise.all([
        supabase.from("members").select("id,name,team_id").eq("id", memberId).maybeSingle(),
        supabase.from("gym_logs").select("date,status").eq("member_id", memberId).gte("date", ws).lte("date", we),
        supabase.from("deep_work").select("id,date,topic,minutes").eq("member_id", memberId).gte("date", ws).lte("date", we),
        supabase.from("sleep_logs").select("date,hours,free_day,sleep_time,wake_time").eq("member_id", memberId).gte("date", ws).lte("date", we),
        supabase.from("macros_logs").select("date,calories").eq("member_id", memberId).gte("date", ws).lte("date", we),
        supabase.from("free_days").select("date").gte("date", ws).lte("date", we),
        supabase.from("sleep_targets").select("*").eq("member_id", memberId).maybeSingle(),
        supabase.from("baseline_scores").select("gym,macros,deep_work,sleep").eq("member_id", memberId).maybeSingle(),
      ]);
      return {
        member: member.data,
        gym: gym.data ?? [],
        dw: dw.data ?? [],
        sleep: sleep.data ?? [],
        macros: macros.data ?? [],
        freeDays: (freeDays.data ?? []).map((f) => f.date),
        target: targets.data,
        baseline: baseline.data,
      };
    },
  });

  const breakdown = useMemo(() => {
    if (!data) return null;
    const monthDays = daysOfMonth(anchor).map(toISODate);

    // Gym
    const gymDays = data.gym.filter((g) => g.status === "yes" || g.status === "home").length;
    const gymPts = Math.min(gymDays * 0.25, 5);

    // Macros: Sat→Fri weeks within month
    const macrosDates = new Set(data.macros.filter((x) => x.calories !== null).map((x) => x.date));
    const weeks = saturdaysInMonth(anchor).map((sat) => {
      const dates = Array.from({ length: 7 }, (_, i) => toISODate(addDays(sat, i)));
      const loggedDays = dates.filter((d) => macrosDates.has(d)).length;
      const complete = loggedDays === 7;
      return { sat, dates, loggedDays, complete };
    });
    const macrosPtsRaw = weeks.filter((w) => w.complete).length * 1.25;
    const macrosPts = Math.min(macrosPtsRaw, 5);

    // Deep work
    const dwCount = data.dw.length;
    const dwPts = Math.min(dwCount * 0.2, 5 * (monthDays.length / 7));

    // Sleep
    const sleepDayResults = monthDays.map((d) => {
      if (data.freeDays.includes(d)) return { date: d, hit: true, reason: "free" as const };
      const s = data.sleep.find((x) => x.date === d);
      if (!s) return { date: d, hit: false, reason: "no-entry" as const };
      if (s.free_day) return { date: d, hit: true, reason: "free" as const };
      if (data.target?.target_sleep && data.target?.target_wake) {
        const hit =
          withinTimeBuzz(s.sleep_time, data.target.target_sleep) &&
          withinTimeBuzz(s.wake_time, data.target.target_wake);
        return { date: d, hit, reason: "target" as const };
      }
      return { date: d, hit: Number(s.hours ?? 0) >= 7, reason: "hours" as const };
    });
    const sleepCount = sleepDayResults.filter((r) => r.hit).length;
    const sleepPts = Math.min(sleepCount * 0.2, 5 * (monthDays.length / 7));

    const baseline = data.baseline ?? { gym: 0, macros: 0, deep_work: 0, sleep: 0 };
    const total =
      gymPts + macrosPts + dwPts + sleepPts +
      Number(baseline.gym ?? 0) + Number(baseline.macros ?? 0) +
      Number(baseline.deep_work ?? 0) + Number(baseline.sleep ?? 0);

    return { gymDays, gymPts, weeks, macrosPts, macrosPtsRaw, dwCount, dwPts, sleepCount, sleepPts, baseline, total, monthDays };
  }, [data, anchor]);

  function withinTimeBuzz(a: string | null | undefined, t: string | null | undefined) {
    return withinTimeBuffer(a, t, 90);
  }

  const fmtRange = (sat: Date) => {
    const end = addDays(sat, 6);
    const f = (x: Date) => `${x.getMonth() + 1}/${x.getDate()}`;
    return `${f(sat)} – ${f(end)}`;
  };

  return (
    <AppShell title="Breakdown">
      <div className="mb-3">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Standings
        </Link>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card p-3">
        <Button variant="ghost" size="icon" onClick={() => setAnchor((d) => shiftMonth(d, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <div className="text-sm font-semibold">{data?.member?.name ?? "…"}</div>
          <div className="text-xs text-muted-foreground">{formatMonth(anchor)}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setAnchor((d) => shiftMonth(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading || !breakdown ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Total */}
          <div className="flex items-center justify-between rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3">
            <div className="text-sm font-semibold uppercase tracking-wider">Month Total</div>
            <div className="text-2xl font-bold tabular-nums">{breakdown.total.toFixed(2)}</div>
          </div>

          {/* Gym */}
          <Section title="Gym" pts={breakdown.gymPts} cap={5}>
            <Row label="Qualifying days (yes/home)" value={String(breakdown.gymDays)} />
            <Row label="Formula" value="0.25 × days, cap 5" />
            <Row label="Days to next 0.25" value={breakdown.gymPts >= 5 ? "—" : String(Math.max(0, Math.ceil((breakdown.gymPts + 0.25) / 0.25) - breakdown.gymDays))} />
          </Section>

          {/* Macros */}
          <Section title="Macros" pts={breakdown.macrosPts} cap={5}>
            <div className="px-4 pb-2 text-[11px] text-muted-foreground">
              1.25 pts per Sat→Fri week with calories logged all 7 days (cap 5)
            </div>
            <ul className="divide-y divide-border border-t border-border">
              {breakdown.weeks.map((w) => (
                <li key={w.sat.toISOString()} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    {w.complete ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium tabular-nums">{fmtRange(w.sat)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">{w.loggedDays}/7</span>
                    <span className="w-12 text-right text-sm font-semibold tabular-nums">
                      {w.complete ? "+1.25" : "0.00"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {breakdown.macrosPtsRaw > breakdown.macrosPts && (
              <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                Raw {breakdown.macrosPtsRaw.toFixed(2)} capped at 5.00
              </div>
            )}
          </Section>

          {/* Deep Work */}
          <Section title="Deep Work" pts={breakdown.dwPts} cap={Number((5 * (breakdown.monthDays.length / 7)).toFixed(2))}>
            <Row label="Sessions logged" value={String(breakdown.dwCount)} />
            <Row label="Formula" value="0.20 × sessions, monthly cap" />
          </Section>

          {/* Sleep */}
          <Section title="Sleep" pts={breakdown.sleepPts} cap={Number((5 * (breakdown.monthDays.length / 7)).toFixed(2))}>
            <Row label="Qualifying days" value={String(breakdown.sleepCount)} />
            <Row label="Formula" value="0.20 × days, monthly cap" />
          </Section>

          {/* Baseline */}
          {breakdown.baseline && (
            Number(breakdown.baseline.gym ?? 0) +
              Number(breakdown.baseline.macros ?? 0) +
              Number(breakdown.baseline.deep_work ?? 0) +
              Number(breakdown.baseline.sleep ?? 0) >
              0 && (
              <Section
                title="Baseline (carried in)"
                pts={
                  Number(breakdown.baseline.gym ?? 0) +
                  Number(breakdown.baseline.macros ?? 0) +
                  Number(breakdown.baseline.deep_work ?? 0) +
                  Number(breakdown.baseline.sleep ?? 0)
                }
              >
                <Row label="Gym" value={Number(breakdown.baseline.gym ?? 0).toFixed(2)} />
                <Row label="Macros" value={Number(breakdown.baseline.macros ?? 0).toFixed(2)} />
                <Row label="Deep Work" value={Number(breakdown.baseline.deep_work ?? 0).toFixed(2)} />
                <Row label="Sleep" value={Number(breakdown.baseline.sleep ?? 0).toFixed(2)} />
              </Section>
            )
          )}
        </div>
      )}
    </AppShell>
  );
}

function Section({
  title,
  pts,
  cap,
  children,
}: {
  title: string;
  pts: number;
  cap?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {cap !== undefined && (
            <div className="text-[11px] text-muted-foreground">cap {cap.toFixed(2)}</div>
          )}
        </div>
        <div className="rounded-full bg-secondary px-3 py-1 text-sm font-bold tabular-nums">
          {pts.toFixed(2)}
        </div>
      </div>
      <div className="border-t border-border">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}