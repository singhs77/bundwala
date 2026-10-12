import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSession } from "@/lib/me";
import { Check, X } from "lucide-react";
import { toISODate, startOfMonth, endOfMonth, daysOfMonth, formatMonth } from "@/lib/week";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { MemberFeed } from "@/components/app/MemberFeed";
import { handleRpcError } from "@/lib/rpc";

export const Route = createFileRoute("/sobriety")({
  head: () => ({
    meta: [
      { title: "Sobriety — Group Tracker" },
      { name: "description", content: "Daily sobriety check for weed, liquor and vape." },
      { property: "og:title", content: "Sobriety — Group Tracker" },
      { property: "og:description", content: "Daily sobriety check for weed, liquor and vape." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SobrietyPage,
});

const SUBSTANCES = [
  { key: "weed", label: "Weed" },
  { key: "liquor", label: "Liquor" },
  { key: "vape", label: "Vape" },
] as const;
type Sub = (typeof SUBSTANCES)[number]["key"];
type Log = {
  id: string;
  member_id: string;
  date: string;
  weed: boolean | null;
  liquor: boolean | null;
  vape: boolean | null;
};

function dayState(l?: Log): "clean" | "used" | "partial" | "none" {
  if (!l) return "none";
  const vals = [l.weed, l.liquor, l.vape];
  if (vals.some((v) => v === true)) return "used";
  if (vals.every((v) => v === false)) return "clean";
  if (vals.every((v) => v == null)) return "none";
  return "partial";
}

function Pill({ used }: { used: boolean | null | undefined }) {
  if (used == null)
    return (
      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">—</span>
    );
  return used ? (
    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">Used</span>
  ) : (
    <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">Clean</span>
  );
}

function SummaryPills({ log }: { log?: Log }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {SUBSTANCES.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1">
          <span className="text-muted-foreground">{s.label}</span>
          <Pill used={log?.[s.key]} />
        </span>
      ))}
    </div>
  );
}

function dateLabel(d: string) {
  const date = new Date(d + "T00:00:00");
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${month} ${day}${suffix}`;
}

function SobrietyPage() {
  const me = useMe();
  const session = useSession();
  const qc = useQueryClient();
  const now = new Date();
  const today = toISODate(now);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const yesterday = toISODate(y);
  const [selectedDate, setSelectedDate] = useState(today);

  const monthDays = daysOfMonth(now);
  const monthStart = toISODate(startOfMonth(now));
  const monthEnd = toISODate(endOfMonth(now));
  // include yesterday even if it's last month
  const fetchStart = yesterday < monthStart ? yesterday : monthStart;

  const { data } = useQuery({
    queryKey: ["sobriety-month", fetchStart, monthEnd],
    queryFn: async () => {
      const [{ data: members }, { data: logs }] = await Promise.all([
        supabase.from("members").select("id,name").eq("is_demo", false),
        supabase
          .from("sobriety_logs")
          .select("id,member_id,date,weed,liquor,vape")
          .gte("date", fetchStart)
          .lte("date", monthEnd)
          .order("date", { ascending: false }),
      ]);
      return { members: (members ?? []) as { id: string; name: string }[], logs: (logs ?? []) as Log[] };
    },
  });

  const logsByMember = useMemo(() => {
    const m = new Map<string, Log[]>();
    for (const l of data?.logs ?? []) {
      if (!m.has(l.member_id)) m.set(l.member_id, []);
      m.get(l.member_id)!.push(l);
    }
    return m;
  }, [data]);

  const myLogs = me ? (logsByMember.get(me) ?? []) : [];
  const selectedLog = myLogs.find((l) => l.date === selectedDate);
  const cleanCount = (rows: Log[]) =>
    rows.filter((l) => l.date >= monthStart && dayState(l) === "clean").length;

  const save = useMutation({
    mutationFn: async (v: { date: string; sub: Sub; used: boolean }) => {
      if (!session) throw new Error("Not signed in");
      const { error } = await supabase.rpc("log_sobriety", {
        _token: session.token,
        _date: v.date,
        _substance: v.sub,
        _used: v.used,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sobriety-month"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(handleRpcError(e)),
  });

  return (
    <AppShell title="Sobriety">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Daily check</h2>
        <p className="mt-0.5 text-2xl font-bold">Did you stay clean?</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[today, yesterday].map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`rounded-xl py-2 text-xs font-semibold transition ${
                d === selectedDate
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-accent"
              }`}
            >
              {dateLabel(d)}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {SUBSTANCES.map((s) => {
            const val = selectedLog?.[s.key];
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-16 text-sm font-semibold">{s.label}</span>
                <button
                  disabled={save.isPending}
                  onClick={() => save.mutate({ date: selectedDate, sub: s.key, used: false })}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-3 text-sm font-semibold transition ${
                    val === false
                      ? "bg-success text-success-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-accent"
                  }`}
                >
                  <Check className="h-4 w-4" /> Clean
                </button>
                <button
                  disabled={save.isPending}
                  onClick={() => save.mutate({ date: selectedDate, sub: s.key, used: true })}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-3 text-sm font-semibold transition ${
                    val === true
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-accent"
                  }`}
                >
                  <X className="h-4 w-4" /> Used
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{formatMonth(now)}</h3>
          <div className="text-right">
            <div className="text-2xl font-bold leading-none">{cleanCount(myLogs)}</div>
            <div className="text-[11px] text-muted-foreground">clean days this month</div>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold uppercase text-muted-foreground">
              {d}
            </div>
          ))}
          {Array.from({ length: monthDays[0].getDay() }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {monthDays.map((date) => {
            const d = toISODate(date);
            const st = dayState(myLogs.find((l) => l.date === d));
            const tone =
              st === "clean"
                ? "bg-success text-success-foreground"
                : st === "used"
                  ? "bg-destructive text-destructive-foreground"
                  : st === "partial"
                    ? "bg-success/30 text-foreground"
                    : d > today
                      ? "bg-secondary/40 text-muted-foreground/50"
                      : "bg-secondary text-muted-foreground";
            return (
              <div
                key={d}
                className={`flex aspect-square items-center justify-center rounded-lg text-xs font-semibold ${tone} ${d === today ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
              >
                {date.getDate()}
              </div>
            );
          })}
        </div>
      </section>

      <MemberFeed
        title="Everyone's sobriety"
        members={data?.members ?? []}
        renderToday={(mid) => {
          const rows = logsByMember.get(mid) ?? [];
          return (
            <div className="space-y-1.5">
              <SummaryPills log={rows.find((l) => l.date === today)} />
              <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {cleanCount(rows)} clean days this month
              </span>
            </div>
          );
        }}
        renderHistory={(mid) => {
          const rows = (logsByMember.get(mid) ?? []).filter((l) => l.date >= monthStart);
          if (!rows.length) return <p className="text-sm text-muted-foreground">No entries this month.</p>;
          return (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 py-2 text-sm">
                  <span className="text-muted-foreground">{r.date}</span>
                  <SummaryPills log={r} />
                </li>
              ))}
            </ul>
          );
        }}
      />
    </AppShell>
  );
}
