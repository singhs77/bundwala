import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSession } from "@/lib/me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toISODate, startOfMonth, endOfMonth } from "@/lib/week";
import { toast } from "sonner";
import { withinTimeBuffer } from "@/lib/score";
import { Trash2 } from "lucide-react";
import { MemberFeed } from "@/components/app/MemberFeed";

export const Route = createFileRoute("/sleep")({
  head: () => ({ meta: [{ title: "Sleep — Group Tracker" }] }),
  component: SleepPage,
});

function hoursBetween(sleep: string, wake: string): number {
  if (!sleep || !wake) return 0;
  const [sh, sm] = sleep.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  let diff = wh * 60 + wm - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

type Member = { id: string; name: string };
type SleepLog = {
  id: string;
  member_id: string;
  date: string;
  sleep_time: string | null;
  wake_time: string | null;
  hours: number | null;
  free_day?: boolean | null;
};
type SleepTarget = {
  member_id: string;
  target_sleep: string | null;
  target_wake: string | null;
};

function SleepPage() {
  const me = useMe();
  const session = useSession();
  const qc = useQueryClient();
  const today = toISODate(new Date());
  const yesterday = toISODate(new Date(Date.now() - 86400000));
  const editableDates = new Set([today, yesterday]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [sleepTime, setSleepTime] = useState("");
  const [wakeTime, setWakeTime] = useState("");

  const { data: target } = useQuery({
    queryKey: ["sleep-target", me],
    queryFn: async () => {
      const { data } = await supabase.from("sleep_targets").select("*").eq("member_id", me!).maybeSingle();
      return data;
    },
    enabled: !!me,
  });

  const { data: today_log } = useQuery({
    queryKey: ["sleep-today", me, selectedDate],
    queryFn: async () => {
      const { data } = await supabase.from("sleep_logs").select("*").eq("member_id", me!).eq("date", selectedDate).maybeSingle();
      return data;
    },
    enabled: !!me,
  });

  useEffect(() => {
    setSleepTime(today_log?.sleep_time?.slice(0, 5) ?? "");
    setWakeTime(today_log?.wake_time?.slice(0, 5) ?? "");
  }, [today_log, selectedDate]);

  const { data: recent } = useQuery({
    queryKey: ["sleep-recent", me],
    queryFn: async () => {
      const { data } = await supabase
        .from("sleep_logs")
        .select("*")
        .eq("member_id", me!)
        .order("date", { ascending: false })
        .limit(7);
      return data ?? [];
    },
    enabled: !!me,
  });

  const { data: groupRows } = useQuery({
    queryKey: ["sleep-month"],
    queryFn: async () => {
      const ms = toISODate(startOfMonth(new Date()));
      const me_ = toISODate(endOfMonth(new Date()));
      const [{ data: members }, { data: logs }, { data: targets }, { data: freeDays }] =
        await Promise.all([
          supabase.from("members").select("id,name"),
          supabase
            .from("sleep_logs")
            .select("id,member_id,date,sleep_time,wake_time,hours,free_day")
            .gte("date", ms)
            .lte("date", me_)
            .order("date", { ascending: false }),
          supabase.from("sleep_targets").select("member_id,target_sleep,target_wake"),
          supabase.from("free_days").select("date").gte("date", ms).lte("date", me_),
        ]);
      return {
        members: (members ?? []) as Member[],
        logs: (logs ?? []) as SleepLog[],
        targets: (targets ?? []) as SleepTarget[],
        freeDays: new Set((freeDays ?? []).map((f: { date: string }) => f.date)),
      };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Not signed in");
      if (!editableDates.has(selectedDate)) throw new Error("Sleep can only be logged for today or yesterday");
      const hours = hoursBetween(sleepTime, wakeTime);
      const { error } = await supabase.rpc("log_sleep", {
        _token: session.token,
        _date: selectedDate,
        _sleep_time: (sleepTime || null) as any,
        _wake_time: (wakeTime || null) as any,
        _hours: hours,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sleep-today"] });
      qc.invalidateQueries({ queryKey: ["sleep-recent"] });
      qc.invalidateQueries({ queryKey: ["sleep-month"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (date: string) => {
      if (!session) throw new Error("Not signed in");
      if (!editableDates.has(date)) throw new Error("Sleep can only be deleted for today or yesterday");
      const { error } = await supabase.rpc("delete_sleep", {
        _token: session.token,
        _date: date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sleep-today"] });
      qc.invalidateQueries({ queryKey: ["sleep-recent"] });
      qc.invalidateQueries({ queryKey: ["sleep-month"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hours = hoursBetween(sleepTime, wakeTime);
  const sleepOk = target?.target_sleep
    ? withinTimeBuffer(sleepTime, target.target_sleep, 90)
    : null;
  const wakeOk = target?.target_wake
    ? withinTimeBuffer(wakeTime, target.target_wake, 90)
    : null;
  const onTarget = sleepOk === true && wakeOk === true;

  const logsByMember = useMemo(() => {
    const m = new Map<string, SleepLog[]>();
    for (const l of groupRows?.logs ?? []) {
      if (!m.has(l.member_id)) m.set(l.member_id, []);
      m.get(l.member_id)!.push(l);
    }
    return m;
  }, [groupRows]);

  const targetByMember = useMemo(() => {
    const m = new Map<string, SleepTarget>();
    for (const t of groupRows?.targets ?? []) m.set(t.member_id, t);
    return m;
  }, [groupRows]);

  function sleepHit(log: SleepLog | undefined, memberId: string): boolean {
    if (!log) return false;
    if (log.free_day) return true;
    if (groupRows?.freeDays.has(log.date)) return true;
    const t = targetByMember.get(memberId);
    if (t?.target_sleep && t?.target_wake) {
      return (
        withinTimeBuffer(log.sleep_time, t.target_sleep, 90) &&
        withinTimeBuffer(log.wake_time, t.target_wake, 90)
      );
    }
    return Number(log.hours ?? 0) >= 7;
  }

  function sleepRow(log: SleepLog | undefined, memberId: string) {
    if (!log) {
      return (
        <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Not logged
        </span>
      );
    }
    const hit = sleepHit(log, memberId);
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {Number(log.hours ?? 0).toFixed(1)}h
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {log.sleep_time?.slice(0, 5)} → {log.wake_time?.slice(0, 5)}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            hit ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
          }`}
        >
          {hit ? "✓ Hit" : "✗ Miss"}
        </span>
      </div>
    );
  }

  return (
    <AppShell title="Sleep">
      {target && (
        <div className="mb-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Your target</p>
          <p className="mt-1 text-lg font-semibold">
            {target.target_sleep?.slice(0, 5)} → {target.target_wake?.slice(0, 5)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ±90 min buffer — within the window still scores the point.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Log sleep</h2>
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
          <div>
            <Label htmlFor="s">Sleep time</Label>
            <Input id="s" type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="w">Wake time</Label>
            <Input id="w" type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-sm">
          <span className="text-muted-foreground">Hours slept</span>
          <span className="text-lg font-bold tabular-nums">{hours.toFixed(2)}</span>
        </div>
        {target?.target_sleep && target?.target_wake && (sleepTime || wakeTime) && (
          <div
            className={`mt-2 rounded-xl px-3 py-2 text-xs font-medium ${
              onTarget
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {onTarget
              ? "✓ Within 90-min buffer — point earned"
              : `Outside buffer — sleep ${sleepOk ? "✓" : "✗"} · wake ${wakeOk ? "✓" : "✗"}`}
          </div>
        )}
        <Button className="mt-3 w-full" onClick={() => save.mutate()} disabled={save.isPending}>
          Save
        </Button>
      </section>


      <MemberFeed
        title="Everyone's sleep logs"
        members={groupRows?.members ?? []}
        renderToday={(mid) => {
          const log = logsByMember.get(mid)?.find((l) => l.date === today);
          return sleepRow(log, mid);
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
                  {sleepRow(r, mid)}
                </li>
              ))}
            </ul>
          );
        }}
      />
    </AppShell>
  );
}
