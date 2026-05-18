import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { Button } from "@/components/ui/button";
import { Check, X, Home } from "lucide-react";
import { toISODate } from "@/lib/week";
import { toast } from "sonner";

export const Route = createFileRoute("/gym")({
  head: () => ({ meta: [{ title: "Gym — Group Tracker" }] }),
  component: GymPage,
});

const statuses = [
  { value: "yes", label: "Hit it", icon: Check, tone: "bg-success text-success-foreground hover:bg-success/90" },
  { value: "home", label: "Home", icon: Home, tone: "bg-warning text-warning-foreground hover:bg-warning/90" },
  { value: "no", label: "Skipped", icon: X, tone: "bg-destructive text-destructive-foreground hover:bg-destructive/90" },
] as const;

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
  const qc = useQueryClient();
  const today = toISODate(new Date());
  const days = lastNDays(14);

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

  const setStatus = useMutation({
    mutationFn: async ({ date, status }: { date: string; status: "yes" | "no" | "home" }) => {
      const { error } = await supabase
        .from("gym_logs")
        .upsert({ member_id: me!, date, status }, { onConflict: "member_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gym-logs"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const todayLog = logs?.find((l) => l.date === today);

  return (
    <AppShell title="Gym">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Today</h2>
        <p className="mt-0.5 text-2xl font-bold">Did you train?</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {statuses.map((s) => {
            const Icon = s.icon;
            const active = todayLog?.status === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setStatus.mutate({ date: today, status: s.value })}
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
    </AppShell>
  );
}
