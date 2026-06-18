import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSession } from "@/lib/me";
import { Button } from "@/components/ui/button";
import { Check, X, Home } from "lucide-react";
import { toISODate, startOfMonth, endOfMonth, daysOfMonth, formatMonth } from "@/lib/week";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { MemberFeed } from "@/components/app/MemberFeed";
import { handleRpcError } from "@/lib/rpc";

export const Route = createFileRoute("/gym")({
  head: () => ({ meta: [{ title: "Gym — Group Tracker" }] }),
  component: GymPage,
});

const statuses = [
  { value: "yes", label: "Hit it", icon: Check, tone: "bg-success text-success-foreground hover:bg-success/90" },
  { value: "home", label: "Home", icon: Home, tone: "bg-warning text-warning-foreground hover:bg-warning/90" },
  { value: "no", label: "Skipped", icon: X, tone: "bg-destructive text-destructive-foreground hover:bg-destructive/90" },
] as const;
type GymStatus = (typeof statuses)[number]["value"];
type Member = { id: string; name: string };
type GymLog = { id: string; member_id: string; date: string; status: GymStatus };

function statusPill(status: GymStatus | null | undefined) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Not logged
      </span>
    );
  }
  const s = statuses.find((x) => x.value === status)!;
  const Icon = s.icon;
  const tone =
    status === "yes"
      ? "bg-success/15 text-success"
      : status === "home"
        ? "bg-warning/15 text-warning"
        : "bg-destructive/15 text-destructive";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(toISODate(d));
  }
  return out;
}

function GymPage() {
  const me = useMe();
  const session = useSession();
  const qc = useQueryClient();
  const today = toISODate(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const pickerDays = lastNDays(3).slice().reverse(); // today, yesterday, 2 days ago

  const now = new Date();
  const monthDays = daysOfMonth(now);
  const monthStartISO = toISODate(startOfMonth(now));
  const monthEndISO = toISODate(endOfMonth(now));

  const { data: logs } = useQuery({
    queryKey: ["gym-logs", me, monthStartISO, monthEndISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gym_logs")
        .select("*")
        .eq("member_id", me!)
        .gte("date", monthStartISO)
        .lte("date", monthEndISO);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!me,
  });

  const monthStart = monthStartISO;
  const monthEnd = monthEndISO;
  const { data: monthData } = useQuery({
    queryKey: ["gym-month", monthStart, monthEnd],
    queryFn: async () => {
      const [{ data: members }, { data: logs }] = await Promise.all([
        supabase.from("members").select("id,name").eq("is_demo", false),
        supabase
          .from("gym_logs")
          .select("id,member_id,date,status")
          .gte("date", monthStart)
          .lte("date", monthEnd)
          .order("date", { ascending: false }),
      ]);
      return {
        members: (members ?? []) as Member[],
        logs: (logs ?? []) as GymLog[],
      };
    },
  });

  const logsByMember = useMemo(() => {
    const m = new Map<string, GymLog[]>();
    for (const l of monthData?.logs ?? []) {
      if (!m.has(l.member_id)) m.set(l.member_id, []);
      m.get(l.member_id)!.push(l);
    }
    return m;
  }, [monthData]);

  const myMonthCount = useMemo(
    () => (logs ?? []).filter((l) => l.status === "yes" || l.status === "home").length,
    [logs],
  );
  const myHitCount = useMemo(
    () => (logs ?? []).filter((l) => l.status === "yes").length,
    [logs],
  );

  const setStatus = useMutation({
    mutationFn: async ({ date, status }: { date: string; status: GymStatus }) => {
      if (!session) throw new Error("Not signed in");
      const { error } = await supabase.rpc("log_gym", {
        _token: session.token,
        _date: date,
        _status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gym-logs"] });
      qc.invalidateQueries({ queryKey: ["gym-month"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(handleRpcError(e)),
  });

  const selectedLog = logs?.find((l) => l.date === selectedDate);

  const dateLabel = (d: string) => {
    const date = new Date(d + "T00:00:00");
    const month = date.toLocaleDateString("en-US", { month: "long" });
    const day = date.getDate();
    const suffix =
      day % 10 === 1 && day !== 11
        ? "st"
        : day % 10 === 2 && day !== 12
          ? "nd"
          : day % 10 === 3 && day !== 13
            ? "rd"
            : "th";
    return `${month} ${day}${suffix}`;
  };

  return (
    <AppShell title="Gym">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Log a workout</h2>
        <p className="mt-0.5 text-2xl font-bold">Did you train?</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {pickerDays.map((d) => {
            const active = d === selectedDate;
            return (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className={`rounded-xl py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-accent"
                }`}
              >
                {dateLabel(d)}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {statuses.map((s) => {
            const Icon = s.icon;
            const active = selectedLog?.status === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setStatus.mutate({ date: selectedDate, status: s.value })}
                disabled={setStatus.isPending}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl py-4 text-sm font-semibold transition ${
                  active ? s.tone : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-5 w-5" />
                {s.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{formatMonth(now)}</h3>
          <div className="text-right">
            <div className="text-2xl font-bold leading-none">{myMonthCount}</div>
            <div className="text-[11px] text-muted-foreground">
              workouts this month{myHitCount !== myMonthCount ? ` (${myHitCount} gym)` : ""}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div
              key={i}
              className="text-center text-[10px] font-semibold uppercase text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {Array.from({ length: monthDays[0].getDay() }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {monthDays.map((date) => {
            const d = toISODate(date);
            const log = logs?.find((l) => l.date === d);
            const isToday = d === today;
            const isFuture = d > today;
            const tone =
              log?.status === "yes"
                ? "bg-success text-success-foreground"
                : log?.status === "home"
                  ? "bg-warning text-warning-foreground"
                  : log?.status === "no"
                    ? "bg-destructive text-destructive-foreground"
                    : isFuture
                      ? "bg-secondary/40 text-muted-foreground/50"
                      : "bg-secondary text-muted-foreground";
            return (
              <div
                key={d}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-semibold ${tone} ${isToday ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
              >
                {date.getDate()}
              </div>
            );
          })}
        </div>
      </section>

      <MemberFeed
        title="Everyone's gym logs"
        members={monthData?.members ?? []}
        renderToday={(mid) => {
          const rows = logsByMember.get(mid) ?? [];
          const log = rows.find((l) => l.date === today);
          const count = rows.filter((l) => l.status === "yes" || l.status === "home").length;
          return (
            <div className="flex flex-wrap items-center gap-2">
              {statusPill(log?.status)}
              <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {count} this month
              </span>
            </div>
          );
        }}
        renderHistory={(mid) => {
          const rows = logsByMember.get(mid) ?? [];
          if (!rows.length)
            return <p className="text-sm text-muted-foreground">No entries this month.</p>;
          return (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-muted-foreground">{r.date}</span>
                  {statusPill(r.status)}
                </li>
              ))}
            </ul>
          );
        }}
      />
    </AppShell>
  );
}
