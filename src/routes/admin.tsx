import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Group Tracker" }] }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();

  const { data: rules } = useQuery({
    queryKey: ["scoring_rules"],
    queryFn: async () => {
      const { data } = await supabase.from("scoring_rules").select("*").order("category");
      return data ?? [];
    },
  });

  const { data: freeDays } = useQuery({
    queryKey: ["free_days"],
    queryFn: async () => {
      const { data } = await supabase.from("free_days").select("*").order("date", { ascending: false });
      return data ?? [];
    },
  });

  const updateRule = useMutation({
    mutationFn: async (r: { category: string; points_per_entry: number; weekly_cap: number }) => {
      const { error } = await supabase.from("scoring_rules").upsert(r);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scoring_rules"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Updated");
    },
  });

  const [date, setDate] = useState("");
  const [label, setLabel] = useState("Meeting Day");
  const addFreeDay = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("free_days").upsert({ date, label });
      if (error) throw error;
    },
    onSuccess: () => {
      setDate("");
      qc.invalidateQueries({ queryKey: ["free_days"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Free day added");
    },
  });
  const removeFreeDay = useMutation({
    mutationFn: async (d: string) => {
      const { error } = await supabase.from("free_days").delete().eq("date", d);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["free_days"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });

  return (
    <AppShell title="Admin">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Scoring rules</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Points per qualifying entry × weekly cap per category.
        </p>
        <div className="mt-3 space-y-3">
          {rules?.map((r) => (
            <RuleRow key={r.category} rule={r} onSave={(rr) => updateRule.mutate(rr)} />
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Free days</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Mark a date that gives free sleep points to everyone (e.g. meeting day).
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="d">Date</Label>
            <Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex-1">
            <Label htmlFor="l">Label</Label>
            <Input id="l" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button onClick={() => addFreeDay.mutate()} disabled={!date}>Add</Button>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {freeDays?.map((f) => (
            <li key={f.date} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium">{f.date}</span>
              <span className="text-muted-foreground">{f.label}</span>
              <Button size="sm" variant="ghost" onClick={() => removeFreeDay.mutate(f.date)}>Remove</Button>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}

function RuleRow({ rule, onSave }: { rule: any; onSave: (r: any) => void }) {
  const [pts, setPts] = useState(String(rule.points_per_entry));
  const [cap, setCap] = useState(String(rule.weekly_cap));
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 text-sm font-medium capitalize">{rule.category.replace("_", " ")}</div>
      <div className="w-20">
        <Label className="text-[10px] uppercase">pts</Label>
        <Input value={pts} onChange={(e) => setPts(e.target.value)} inputMode="decimal" />
      </div>
      <div className="w-20">
        <Label className="text-[10px] uppercase">cap</Label>
        <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" />
      </div>
      <Button
        size="sm"
        onClick={() => onSave({ category: rule.category, points_per_entry: Number(pts), weekly_cap: Number(cap) })}
      >
        Save
      </Button>
    </div>
  );
}
