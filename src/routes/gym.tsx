import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSession } from "@/lib/me";
import { Button } from "@/components/ui/button";
import { Check, X, Home } from "lucide-react";
import { toISODate } from "@/lib/week";
import { toast } from "sonner";
import { useState } from "react";

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
  const days = lastNDays(14);
  const [selectedDate, setSelectedDate] = useState(today);
  const pickerDays = lastNDays(3).slice().reverse(); // today, yesterday, 2 days ago

  const { data: logs } = useQuery({
    queryKey: ["gym-logs", me, days[0], days[days.length - 1]],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gym_logs")
        .select("*")
        .eq("member_id", me!)
        .gte("date", days[0])
        .lte("date", days[days.length - 1]);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!me,
  });

  const { data: groupRows } = useQuery({
    queryKey: ["gym-group"],
    queryFn: async () => {
      const { data: members, error: membersError } = await supabase
        .from("members")
        .select("id,name");
      if (membersError) throw membersError;

      const { data: allLogs, error: logsError } = await supabase
        .from("gym_logs")
        .select("id,member_id,date,status")
        .gte("date", days[0])
        .lte("date", days[days.length - 1])
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (logsError) throw logsError;

      const names = new Map((members ?? []).map((m: Member) => [m.id, m.name]));
      return (allLogs ?? []).map((log: GymLog) => ({
        ...log,
        memberName: names.get(log.member_id) ?? "Unknown",
      }));
    },
  });

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
      qc.invalidateQueries({ queryKey: ["gym-group"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedLog = logs?.find((l) => l.date === selectedDate);

  const dateLabel = (d: string) => {
    if (d === today) return "Today";
    const t = new Date(today + "T00:00:00");
    const diff = Math.round((t.getTime() - new Date(d + "T00:00:00").getTime()) / 86400000);
    if (diff === 1) return "Yesterday";
    return `${diff} days ago`;
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
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Last 14 days</h3>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const log = logs?.find((l) => l.date === d);
            const tone =
              log?.status === "yes"
                ? "bg-success text-success-foreground"
                : log?.status === "home"
                  ? "bg-warning text-warning-foreground"
                  : log?.status === "no"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-secondary text-muted-foreground";
            const day = new Date(d + "T00:00:00").getDate();
            return (
              <div
                key={d}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-semibold ${tone}`}
              >
                {day}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Everyone's gym logs</h3>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {groupRows?.length ? groupRows.map((r) => {
            const status = statuses.find((s) => s.value === r.status);
            const Icon = status?.icon ?? X;
            const tone =
              r.status === "yes"
                ? "bg-success/15 text-success"
                : r.status === "home"
                  ? "bg-warning/15 text-warning"
                  : "bg-destructive/15 text-destructive";
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.memberName}</div>
                  <div className="text-xs text-muted-foreground">{r.date}</div>
                </div>
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                  {status?.label ?? r.status}
                </div>
              </li>
            );
          }) : <li className="p-4 text-center text-sm text-muted-foreground">No gym logs yet.</li>}
        </ul>
      </section>
    </AppShell>
  );
}
