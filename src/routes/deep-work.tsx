import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSession } from "@/lib/me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Send, Clock, Trash2 } from "lucide-react";
import { toISODate, startOfMonth, endOfMonth } from "@/lib/week";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { MemberFeed } from "@/components/app/MemberFeed";

export const Route = createFileRoute("/deep-work")({
  head: () => ({ meta: [{ title: "Deep Work — Group Tracker" }] }),
  component: DeepWorkPage,
});

type Member = { id: string; name: string };
type DWSession = {
  id: string;
  member_id: string;
  date: string;
  topic: string | null;
  minutes: number | null;
  learnings: string | null;
  personal_notes: string | null;
  created_at: string;
};

function DeepWorkPage() {
  const me = useMe();
  const session = useSession();
  const qc = useQueryClient();
  const today = toISODate(new Date());
  const ms = toISODate(startOfMonth(new Date()));
  const me_ = toISODate(endOfMonth(new Date()));

  const { data: groupRows } = useQuery({
    queryKey: ["dw-month", ms, me_],
    queryFn: async () => {
      const [{ data: members }, { data: logs }] = await Promise.all([
        supabase.from("members").select("id,name"),
        supabase
          .from("deep_work")
          .select("*")
          .gte("date", ms)
          .lte("date", me_)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      return {
        members: (members ?? []) as Member[],
        logs: (logs ?? []) as DWSession[],
      };
    },
  });

  const logsByMember = useMemo(() => {
    const m = new Map<string, DWSession[]>();
    for (const l of groupRows?.logs ?? []) {
      if (!m.has(l.member_id)) m.set(l.member_id, []);
      m.get(l.member_id)!.push(l);
    }
    return m;
  }, [groupRows]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dw-month"] });
    qc.invalidateQueries({ queryKey: ["leaderboard"] });
  };

  function todayPill(log: DWSession | undefined) {
    if (!log) {
      return (
        <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Not logged
        </span>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
          ✓ Logged
        </span>
        {log.minutes ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
            <Clock className="h-3 w-3" /> {log.minutes}m
          </span>
        ) : null}
        {log.topic ? (
          <span className="truncate text-xs text-muted-foreground">{log.topic}</span>
        ) : null}
      </div>
    );
  }

  return (
    <AppShell title="Deep Work">
      <NewSessionButton onCreated={invalidate} token={session?.token ?? null} />

      <MemberFeed
        title="Everyone's deep work"
        members={groupRows?.members ?? []}
        renderToday={(mid) => {
          const log = logsByMember.get(mid)?.find((l) => l.date === today);
          return todayPill(log);
        }}
        renderHistory={(mid) => {
          const rows = logsByMember.get(mid) ?? [];
          if (!rows.length)
            return <p className="text-sm text-muted-foreground">No sessions this month.</p>;
          return (
            <div className="space-y-3">
              {rows.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  token={session?.token ?? null}
                  memberId={me ?? null}
                  onChanged={invalidate}
                />
              ))}
            </div>
          );
        }}
      />
    </AppShell>
  );
}

function NewSessionButton({ onCreated, token }: { onCreated: () => void; token: string | null }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [minutes, setMinutes] = useState<string>("");
  const [learnings, setLearnings] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not signed in");
      const mins = minutes ? Number(minutes) : null;
      if (mins !== null && (!Number.isFinite(mins) || mins < 1 || mins > 600))
        throw new Error("Minutes must be 1–600");
      const { error } = await supabase.rpc("log_deep_work", {
        _token: token,
        _date: toISODate(new Date()),
        _topic: topic || null,
        _minutes: mins,
        _learnings: learnings || null,
        _personal_notes: notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setTopic("");
      setMinutes("");
      setLearnings("");
      setNotes("");
      setOpen(false);
      onCreated();
      toast.success("Logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-14 w-full text-base font-semibold">
          <Plus className="mr-1 h-5 w-5" /> Log today's session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New deep work session</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="EA MCQs Part 2"
            />
          </div>
          <div>
            <Label htmlFor="minutes">Time spent (minutes)</Label>
            <Input
              id="minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="60"
            />
          </div>
          <div>
            <Label htmlFor="learnings">Quick learnings</Label>
            <Textarea
              id="learnings"
              rows={4}
              value={learnings}
              onChange={(e) => setLearnings(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="notes">Personal notes</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={create.isPending || !topic}
            onClick={() => create.mutate()}
            className="w-full"
          >
            Save session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionCard({
  session,
  token,
  memberId,
  onChanged,
}: {
  session: DWSession;
  token: string | null;
  memberId: string | null;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const { data: comments } = useQuery({
    queryKey: ["dw-comments", session.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dw_comments")
        .select("*, members(name)")
        .eq("deep_work_id", session.id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: showComments,
  });
  const [body, setBody] = useState("");
  const addComment = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not signed in");
      const { error } = await supabase.rpc("add_dw_comment", {
        _token: token,
        _deep_work_id: session.id,
        _body: body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["dw-comments", session.id] });
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not signed in");
      const { error } = await supabase.rpc("delete_deep_work", {
        _token: token,
        _id: session.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Session deleted");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isOwn = memberId && session.member_id === memberId;

  return (
    <article className="rounded-xl border border-border bg-card p-3">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {format(parseISO(session.date), "EEE, MMM d, yyyy")}
        </div>
        <div className="flex items-center gap-2">
          {session.minutes ? (
            <div className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
              <Clock className="h-3 w-3" /> {session.minutes}m
            </div>
          ) : null}
          {isOwn && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              disabled={del.isPending}
              onClick={() => {
                if (confirm("Delete this session? Your standings will update.")) {
                  del.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>
      {session.topic && <p className="font-medium">{session.topic}</p>}
      {session.learnings && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{session.learnings}</p>
      )}
      <button
        className="mt-3 text-xs font-medium text-primary"
        onClick={() => setShowComments((v) => !v)}
      >
        {showComments ? "Hide comments" : "Comments"}
      </button>
      {showComments && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {comments?.map((c: any) => (
            <div key={c.id} className="rounded-lg bg-secondary px-3 py-2 text-sm">
              <div className="text-xs font-semibold">{c.members?.name}</div>
              <div>{c.body}</div>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Drop a comment…"
            />
            <Button
              size="icon"
              disabled={!body || addComment.isPending}
              onClick={() => addComment.mutate()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}