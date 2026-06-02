import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { sendAdminBroadcast } from "@/lib/push.functions";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Group Tracker" }] }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const [adminPw, setAdminPw] = useState("");

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
      if (!adminPw) throw new Error("Admin password required");
      const { error } = await supabase.rpc("admin_upsert_rule", {
        _password: adminPw,
        _category: r.category,
        _points: r.points_per_entry,
        _cap: r.weekly_cap,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scoring_rules"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [date, setDate] = useState("");
  const [label, setLabel] = useState("Meeting Day");
  const addFreeDay = useMutation({
    mutationFn: async () => {
      if (!adminPw) throw new Error("Admin password required");
      const { error } = await supabase.rpc("admin_add_free_day", {
        _password: adminPw,
        _date: date,
        _label: label,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDate("");
      qc.invalidateQueries({ queryKey: ["free_days"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success("Free day added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeFreeDay = useMutation({
    mutationFn: async (d: string) => {
      if (!adminPw) throw new Error("Admin password required");
      const { error } = await supabase.rpc("admin_remove_free_day", {
        _password: adminPw,
        _date: d,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["free_days"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Admin">
      <section className="rounded-2xl border border-border bg-card p-4">
        <Label htmlFor="admin-pw" className="text-sm font-semibold text-muted-foreground">
          Admin password
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Required to update scoring rules and free days below.
        </p>
        <Input
          id="admin-pw"
          type="password"
          className="mt-2"
          value={adminPw}
          onChange={(e) => setAdminPw(e.target.value)}
        />
      </section>

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

      <BroadcastSection />
      <DailyReminderSection />
      <AnnouncementsSection />
      <ChangePasswordSection />
    </AppShell>
  );
}

function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (next !== confirm) throw new Error("New passwords don't match");
      if (next.length < 4) throw new Error("New password must be at least 4 characters");
      const { error } = await supabase.rpc("admin_set_password", {
        _current: current,
        _new: next,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Admin password updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Change admin password</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Update the password used for all admin actions on this page.
      </p>
      <div className="mt-3 space-y-2">
        <div>
          <Label htmlFor="cp-cur">Current password</Label>
          <Input id="cp-cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cp-new">New password</Label>
          <Input id="cp-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cp-conf">Confirm new password</Label>
          <Input id="cp-conf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button
          className="w-full"
          onClick={() => save.mutate()}
          disabled={save.isPending || !current || !next || !confirm}
        >
          {save.isPending ? "Saving…" : "Update password"}
        </Button>
      </div>
    </section>
  );
}

function DailyReminderSection() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["notification_settings"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_notification_settings");
      return data?.[0] ?? null;
    },
  });

  const [password, setPassword] = useState("");
  const [time, setTime] = useState("20:00");
  const [title, setTitle] = useState("Daily check-in");
  const [body, setBody] = useState("Don't forget to log gym and macros today.");

  useEffect(() => {
    if (!settings) return;
    if (settings.reminder_time) setTime(String(settings.reminder_time).slice(0, 5));
    if (settings.reminder_title) setTitle(settings.reminder_title);
    if (settings.reminder_body) setBody(settings.reminder_body);
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_update_notification_settings", {
        _password: password,
        _time: time,
        _title: title,
        _body: body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification_settings"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Daily reminder</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        One global time + message sent to everyone with notifications enabled.
      </p>
      <div className="mt-3 space-y-2">
        <div>
          <Label htmlFor="dp">Admin password</Label>
          <Input id="dp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="dt">Time</Label>
          <Input id="dt" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="dti">Title</Label>
          <Input id="dti" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="db">Message</Label>
          <Textarea
            id="db"
            maxLength={300}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <Button
          className="w-full"
          onClick={() => save.mutate()}
          disabled={save.isPending || !password || !title || !body || !time}
        >
          {save.isPending ? "Saving…" : "Save daily reminder"}
        </Button>
      </div>
    </section>
  );
}

function AnnouncementsSection() {
  const qc = useQueryClient();
  const { data: items } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, body, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const [password, setPassword] = useState("");
  const [body, setBody] = useState("");

  const post = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_post_announcement", {
        _password: password,
        _body: body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Posted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async ({ id, pw }: { id: string; pw: string }) => {
      const { error } = await supabase.rpc("admin_delete_announcement", {
        _password: pw,
        _id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleDelete(id: string) {
    let pw = password;
    if (!pw) {
      pw = window.prompt("Admin password") ?? "";
    }
    if (!pw) {
      toast.error("Password required");
      return;
    }
    if (!window.confirm("Delete this announcement?")) return;
    remove.mutate({ id, pw });
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Announcements</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Posted messages appear at the top of the Standings page for everyone.
      </p>
      <div className="mt-3 space-y-2">
        <div>
          <Label htmlFor="ap">Admin password</Label>
          <Input id="ap" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ab">New announcement</Label>
          <Textarea
            id="ab"
            maxLength={1000}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Heads up team…"
          />
        </div>
        <Button
          className="w-full"
          onClick={() => post.mutate()}
          disabled={post.isPending || !password || !body.trim()}
        >
          {post.isPending ? "Posting…" : "Post announcement"}
        </Button>
      </div>
      {items && items.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {items.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap break-words">{a.body}</p>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDelete(a.id)}
                disabled={remove.isPending}
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BroadcastSection() {
  const broadcast = useServerFn(sendAdminBroadcast);
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  async function send() {
    if (!password || !title || !body) return;
    setPending(true);
    try {
      const res = await broadcast({ data: { password, title, body } });
      toast.success(`Sent: ${res.sent}, failed: ${res.failed}`);
      setTitle("");
      setBody("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Broadcast notification</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Send a push notification to every member who has notifications enabled.
      </p>
      <div className="mt-3 space-y-2">
        <div>
          <Label htmlFor="bp">Admin password</Label>
          <Input
            id="bp"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="bt">Title</Label>
          <Input
            id="bt"
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Heads up team"
          />
        </div>
        <div>
          <Label htmlFor="bb">Message</Label>
          <Textarea
            id="bb"
            maxLength={300}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Don't forget to log your workouts today."
          />
        </div>
        <Button
          className="w-full"
          onClick={send}
          disabled={pending || !password || !title || !body}
        >
          {pending ? "Sending…" : "Send broadcast"}
        </Button>
      </div>
    </section>
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
