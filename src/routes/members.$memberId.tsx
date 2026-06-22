import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowLeft, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  daysOfMonth,
  endOfMonth,
  endOfWeek,
  formatMonth,
  shiftMonth,
  startOfMonth,
  startOfWeek,
  toISODate,
} from "@/lib/week";
import { withinTimeBuffer } from "@/lib/score";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const Route = createFileRoute("/members/$memberId")({
  head: () => ({ meta: [{ title: "Member Logs — Group Tracker" }] }),
  component: MemberLogsPage,
});

function fmtTime(t: string | null | undefined): string {
  if (!t) return "—";
  const [hh, mm] = t.split(":");
  const h = Number(hh);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${ampm}`;
}

function fmtShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MemberLogsPage() {
  const { memberId } = Route.useParams();
  const [anchor, setAnchor] = useState(() => new Date());
  const qc = useQueryClient();

  const ms = useMemo(() => toISODate(startOfMonth(anchor)), [anchor]);
  const me_ = useMemo(() => toISODate(endOfMonth(anchor)), [anchor]);
  const ws = useMemo(() => toISODate(startOfWeek(new Date())), []);
  const we = useMemo(() => toISODate(endOfWeek(new Date())), []);
  const monthDays = useMemo(() => daysOfMonth(anchor), [anchor]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => qc.invalidateQueries({ queryKey: ["member-logs", memberId] }), 400);
    };
    const ch = supabase
      .channel(`member-logs-${memberId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gym_logs", filter: `member_id=eq.${memberId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sleep_logs", filter: `member_id=eq.${memberId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "macros_logs", filter: `member_id=eq.${memberId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "deep_work", filter: `member_id=eq.${memberId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "free_days" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `id=eq.${memberId}` }, refresh)
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [memberId, qc]);

  const { data, isLoading } = useQuery({
    queryKey: ["member-logs", memberId, ms, me_, ws, we],
    queryFn: async () => {
      const [member, teams, gym, dw, sleep, target, macrosMonth, macrosWeek, freeDays] =
        await Promise.all([
          supabase.from("members").select("id,name,team_id,avatar_url,calorie_goal,last_login_at").eq("id", memberId).maybeSingle(),
          supabase.from("teams").select("id,name"),
          supabase.from("gym_logs").select("date,status").eq("member_id", memberId).gte("date", ms).lte("date", me_),
          supabase.from("deep_work").select("id,date,topic,minutes,learnings,personal_notes").eq("member_id", memberId).gte("date", ms).lte("date", me_).order("date", { ascending: false }),
          supabase.from("sleep_logs").select("date,sleep_time,wake_time,hours,free_day").eq("member_id", memberId).gte("date", ms).lte("date", me_).order("date", { ascending: false }),
          supabase.from("sleep_targets").select("target_sleep,target_wake").eq("member_id", memberId).maybeSingle(),
          supabase.from("macros_logs").select("date,calories,protein,carbs,fat,sugar,water").eq("member_id", memberId).gte("date", ms).lte("date", me_),
          supabase.from("macros_logs").select("date,calories,protein,carbs,fat,sugar,water").eq("member_id", memberId).gte("date", ws).lte("date", we),
          supabase.from("free_days").select("date").gte("date", ms).lte("date", me_),
        ]);
      return {
        member: member.data,
        teams: teams.data ?? [],
        gym: gym.data ?? [],
        dw: dw.data ?? [],
        sleep: sleep.data ?? [],
        target: target.data,
        macrosMonth: macrosMonth.data ?? [],
        macrosWeek: macrosWeek.data ?? [],
        freeDays: (freeDays.data ?? []).map((f) => f.date),
      };
    },
  });

  const scores = useMemo(() => {
    if (!data) return { gym: 0, deep_work: 0, sleep: 0, macros: 0, total: 0 };
    const gymCount = data.gym.filter((g: any) => g.status === "yes" || g.status === "home").length;
    const dwCount = data.dw.length;
    const monthISO = monthDays.map(toISODate);
    const sleepCount = monthISO.filter((d) => {
      if (data.freeDays.includes(d)) return true;
      const s = data.sleep.find((x: any) => x.date === d);
      if (!s) return false;
      if (s.free_day) return true;
      const t = data.target as any;
      if (t?.target_sleep && t?.target_wake) {
        return withinTimeBuffer(s.sleep_time, t.target_sleep, 90) && withinTimeBuffer(s.wake_time, t.target_wake, 90);
      }
      return Number(s.hours ?? 0) >= 7;
    }).length;
    const macrosCount = data.macrosMonth.filter(
      (x: any) => x.calories != null && x.protein != null && x.carbs != null && x.fat != null,
    ).length;
    const gym = gymCount * 0.2;
    const deep_work = dwCount * 0.3;
    const sleep = sleepCount * 0.1;
    const macros = macrosCount * 0.2;
    return {
      gym,
      deep_work,
      sleep,
      macros,
      total: Number((gym + deep_work + sleep + macros).toFixed(2)),
    };
  }, [data, monthDays]);

  const team = useMemo(() => {
    if (!data?.member?.team_id) return null;
    return data.teams.find((t: any) => t.id === data.member!.team_id);
  }, [data]);

  const avg = (rows: any[], field: string): number => {
    const vs = rows.map((r) => r[field]).filter((v) => v != null) as number[];
    if (!vs.length) return 0;
    return Math.round(vs.reduce((a, b) => a + b, 0) / vs.length);
  };

  const NUM_FIELDS = ["calories", "protein", "carbs", "fat", "sugar"] as const;
  const weekAvg = useMemo(() => {
    const out: Record<string, number> = {};
    NUM_FIELDS.forEach((f) => (out[f] = avg(data?.macrosWeek ?? [], f)));
    return out;
  }, [data]);
  const monthAvg = useMemo(() => {
    const out: Record<string, number> = {};
    NUM_FIELDS.forEach((f) => (out[f] = avg(data?.macrosMonth ?? [], f)));
    return out;
  }, [data]);

  const macrosQualified = useMemo(
    () =>
      (data?.macrosMonth ?? []).filter(
        (x: any) => x.calories != null && x.protein != null && x.carbs != null && x.fat != null,
      ),
    [data],
  );
  const withinGoal = useMemo(() => {
    const g = data?.member?.calorie_goal;
    if (!g) return null;
    return macrosQualified.filter((x: any) => Math.abs(Number(x.calories) - g) <= 100).length;
  }, [macrosQualified, data]);

  if (isLoading || !data) {
    return (
      <AppShell title="Member">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (!data.member) {
    return (
      <AppShell title="Member">
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Member not found.
          <div className="mt-3">
            <Button asChild variant="secondary" size="sm">
              <Link to="/">Back to standings</Link>
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const m = data.member;
  const gymByDate = new Map(data.gym.map((g: any) => [g.date, g.status]));

  return (
    <AppShell title={m.name}>
      <div className="mb-3 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" /> Standings
          </Link>
        </Button>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card p-3">
        <Button variant="ghost" size="icon" onClick={() => setAnchor((d) => shiftMonth(d, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium">{formatMonth(anchor)}</div>
        <Button variant="ghost" size="icon" onClick={() => setAnchor((d) => shiftMonth(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Header */}
      <section className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          {m.avatar_url ? (
            <img src={m.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-base font-bold">
              {m.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{m.name}</div>
            <div className="text-xs text-muted-foreground">{team?.name ?? "No team"}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Last on app:{" "}
              {(m as any).last_login_at
                ? new Date((m as any).last_login_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Never"}
            </div>
          </div>
          <div className="rounded-full bg-primary/15 px-3 py-1 text-base font-bold tabular-nums text-primary">
            {scores.total.toFixed(1)}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[
            { k: "Gym", v: scores.gym },
            { k: "DW", v: scores.deep_work },
            { k: "Sleep", v: scores.sleep },
            { k: "Macros", v: scores.macros },
          ].map((c) => (
            <div key={c.k} className="rounded-xl bg-secondary px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.k}</div>
              <div className="text-sm font-bold tabular-nums">{c.v.toFixed(1)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Gym */}
      <section className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Gym</h3>
          <div className="text-xs text-muted-foreground">
            {data.gym.filter((g: any) => g.status === "yes" || g.status === "home").length} / {monthDays.length} days
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-center text-[10px] uppercase tracking-wider text-muted-foreground">
              {d}
            </div>
          ))}
          {Array.from({ length: monthDays[0].getDay() }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {monthDays.map((d) => {
            const iso = toISODate(d);
            const st = gymByDate.get(iso) as string | undefined;
            const hit = st === "yes" || st === "home";
            const no = st === "no";
            return (
              <div
                key={iso}
                className={`flex aspect-square items-center justify-center rounded-md text-[10px] tabular-nums ${
                  hit
                    ? "bg-success/20 text-success"
                    : no
                      ? "border border-destructive/40 text-destructive/70"
                      : "bg-secondary/50 text-muted-foreground"
                }`}
                title={`${iso}${st ? ` · ${st}` : ""}`}
              >
                {d.getDate()}
              </div>
            );
          })}
        </div>
      </section>

      {/* Deep Work */}
      <section className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Deep Work</h3>
          <div className="text-xs text-muted-foreground">{data.dw.length} sessions</div>
        </div>
        {data.dw.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No deep work logged this month.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {data.dw.map((d: any) => (
              <li key={d.id} className="py-2">
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <button className="flex w-full items-center justify-between gap-2 text-left">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {d.topic || <span className="text-muted-foreground italic">No topic</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtShortDate(d.date)} · {d.minutes ?? "?"} min
                        </div>
                      </div>
                      {(d.learnings || d.personal_notes) && (
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  {(d.learnings || d.personal_notes) && (
                    <CollapsibleContent className="mt-2 space-y-2 rounded-lg bg-secondary/50 p-3 text-sm">
                      {d.learnings && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Learnings</div>
                          <div className="mt-0.5 whitespace-pre-wrap">{d.learnings}</div>
                        </div>
                      )}
                      {d.personal_notes && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</div>
                          <div className="mt-0.5 whitespace-pre-wrap">{d.personal_notes}</div>
                        </div>
                      )}
                    </CollapsibleContent>
                  )}
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sleep */}
      <section className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Sleep</h3>
          <div className="text-xs text-muted-foreground">{data.sleep.length} logs</div>
        </div>
        {data.sleep.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No sleep logged this month.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {data.sleep.map((s: any) => {
              const t = data.target as any;
              const onTime = t?.target_sleep && t?.target_wake
                ? withinTimeBuffer(s.sleep_time, t.target_sleep, 90) &&
                  withinTimeBuffer(s.wake_time, t.target_wake, 90)
                : Number(s.hours ?? 0) >= 7;
              return (
                <li key={s.date} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{fmtShortDate(s.date)}</div>
                    {s.free_day ? (
                      <div className="text-xs text-muted-foreground">Free day</div>
                    ) : (
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {fmtTime(s.sleep_time)} → {fmtTime(s.wake_time)} · {Number(s.hours ?? 0).toFixed(2)}h
                      </div>
                    )}
                  </div>
                  {s.free_day ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Free
                    </span>
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        onTime ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {onTime ? "On time" : "Off"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Macros */}
      <section className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Macros</h3>
          <div className="text-xs text-muted-foreground">
            {macrosQualified.length} qualifying days
          </div>
        </div>
        {m.calorie_goal != null && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Calorie goal:</span>
            <span className="font-semibold tabular-nums">{m.calorie_goal}</span>
            {withinGoal != null && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">
                {withinGoal} within ±100
              </span>
            )}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[
            { label: "This week", vals: weekAvg },
            { label: "This month", vals: monthAvg },
          ].map((card) => (
            <div key={card.label} className="rounded-xl bg-secondary p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{card.label}</div>
              <div className="mt-2 space-y-1 text-xs">
                {NUM_FIELDS.map((f) => (
                  <div key={f} className="flex justify-between">
                    <span className="capitalize text-muted-foreground">{f}</span>
                    <span className="font-semibold tabular-nums">{card.vals[f] || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
