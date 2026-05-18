import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSession } from "@/lib/me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toISODate } from "@/lib/week";
import { toast } from "sonner";

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

function SleepPage() {
  const me = useMe();
  const session = useSession();
  const qc = useQueryClient();
  const today = toISODate(new Date());
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
    queryKey: ["sleep-today", me, today],
    queryFn: async () => {
      const { data } = await supabase.from("sleep_logs").select("*").eq("member_id", me!).eq("date", today).maybeSingle();
      return data;
    },
    enabled: !!me,
  });

  useEffect(() => {
    if (today_log) {
      setSleepTime(today_log.sleep_time?.slice(0, 5) ?? "");
      setWakeTime(today_log.wake_time?.slice(0, 5) ?? "");
    }
  }, [today_log]);

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

  const save = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Not signed in");
      const hours = hoursBetween(sleepTime, wakeTime);
      const { error } = await supabase.rpc("log_sleep", {
        _token: session.token,
        _date: today,
        _sleep_time: (sleepTime || null) as any,
        _wake_time: (wakeTime || null) as any,
        _hours: hours,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sleep-today"] });
      qc.invalidateQueries({ queryKey: ["sleep-recent"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hours = hoursBetween(sleepTime, wakeTime);

  return (
    <AppShell title="Sleep">
      {target && (
        <div className="mb-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Your target</p>
          <p className="mt-1 text-lg font-semibold">
            {target.target_sleep?.slice(0, 5)} → {target.target_wake?.slice(0, 5)}
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Log today</h2>
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
        <Button className="mt-3 w-full" onClick={() => save.mutate()} disabled={save.isPending}>
          Save
        </Button>
      </section>

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Last 7 entries</h3>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {recent?.length ? recent.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-medium">{r.date}</span>
              <span className="text-muted-foreground">
                {r.sleep_time?.slice(0, 5)} → {r.wake_time?.slice(0, 5)}
              </span>
              <span className="font-bold tabular-nums">{Number(r.hours ?? 0).toFixed(1)}h</span>
            </li>
          )) : <li className="p-4 text-center text-sm text-muted-foreground">No entries yet.</li>}
        </ul>
      </section>
    </AppShell>
  );
}
