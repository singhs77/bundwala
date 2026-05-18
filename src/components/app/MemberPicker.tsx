import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setStoredMemberId, useMe } from "@/lib/me";
import { Button } from "@/components/ui/button";
import { ChevronDown, UserCircle2, Lock, Pencil } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sha256 } from "@/lib/hash";
import { toast } from "sonner";

export function useMembersQuery() {
  return useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("*, teams(*)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

type Member = {
  id: string;
  name: string;
  password_hash: string | null;
};

function PasswordPrompt({
  member,
  onClose,
  onAuthed,
}: {
  member: Member | null;
  onClose: () => void;
  onAuthed: (id: string) => void;
}) {
  const isSetup = !!member && !member.password_hash;
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPw("");
    setConfirm("");
    setBusy(false);
  };

  const submit = async () => {
    if (!member) return;
    if (!pw) return toast.error("Enter a password");
    setBusy(true);
    try {
      const hash = await sha256(pw);
      if (isSetup) {
        if (pw !== confirm) {
          setBusy(false);
          return toast.error("Passwords don't match");
        }
        const { error } = await supabase
          .from("members")
          .update({ password_hash: hash })
          .eq("id", member.id);
        if (error) throw error;
        toast.success("Password set");
      } else {
        if (hash !== member.password_hash) {
          setBusy(false);
          return toast.error("Wrong password");
        }
      }
      onAuthed(member.id);
      reset();
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!member} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isSetup ? `Set a password for ${member?.name}` : `Welcome back, ${member?.name}`}
          </DialogTitle>
          <DialogDescription>
            {isSetup
              ? "Pick a password so no one else can log in as you."
              : "Enter your password to continue."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isSetup && submit()}
            />
          </div>
          {isSetup && (
            <div>
              <Label htmlFor="pw2">Confirm password</Label>
              <Input
                id="pw2"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} className="w-full">
            {isSetup ? "Set password & continue" : "Sign in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  member,
  open,
  onOpenChange,
  onRenamed,
}: {
  member: Member | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRenamed: () => void;
}) {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!member) return;
    if (!name.trim()) return toast.error("Enter a name");
    setBusy(true);
    try {
      if (member.password_hash) {
        const h = await sha256(pw);
        if (h !== member.password_hash) {
          setBusy(false);
          return toast.error("Wrong password");
        }
      }
      const { error } = await supabase
        .from("members")
        .update({ name: name.trim() })
        .eq("id", member.id);
      if (error) throw error;
      toast.success("Name updated");
      setName(""); setPw(""); setBusy(false);
      onRenamed();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change your name</DialogTitle>
          <DialogDescription>
            {member?.password_hash ? "Confirm with your password." : "Pick a new name."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="new-name">New name</Label>
            <Input
              id="new-name"
              autoFocus
              value={name}
              placeholder={member?.name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {member?.password_hash && (
            <div>
              <Label htmlFor="cur-pw">Password</Label>
              <Input
                id="cur-pw"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} className="w-full">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MemberGate({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const { data: members, isLoading } = useMembersQuery();
  const [pending, setPending] = useState<Member | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!me) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Who are you?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick your name. First time? You'll set a password to lock your profile.
          </p>
        </div>
        <div className="grid w-full max-w-sm grid-cols-2 gap-2">
          {members?.map((m) => (
            <Button
              key={m.id}
              variant="secondary"
              className="h-12 justify-start"
              onClick={() => setPending(m as Member)}
            >
              <UserCircle2 className="mr-2 h-5 w-5" />
              <span className="flex-1 text-left">{m.name}</span>
              {(m as Member).password_hash && (
                <Lock className="ml-1 h-3.5 w-3.5 opacity-60" />
              )}
            </Button>
          ))}
        </div>
        <PasswordPrompt
          member={pending}
          onClose={() => setPending(null)}
          onAuthed={(id) => { setStoredMemberId(id); setPending(null); }}
        />
      </div>
    );
  }
  return <>{children}</>;
}

export function CurrentMemberBadge() {
  const me = useMe();
  const { data: members } = useMembersQuery();
  const current = members?.find((m) => m.id === me) as Member | undefined;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Member | null>(null);
  const [renaming, setRenaming] = useState(false);
  if (!current) return null;
  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium">
          <UserCircle2 className="h-4 w-4" />
          {current.name}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch user</DialogTitle>
          <DialogDescription>Locked profiles need a password.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {members?.map((m) => (
            <Button
              key={m.id}
              variant={m.id === me ? "default" : "secondary"}
              className="h-11 justify-start"
              onClick={() => {
                if (m.id === me) { setOpen(false); return; }
                const mem = m as Member;
                if (mem.password_hash) {
                  setPending(mem);
                  setOpen(false);
                } else {
                  setPending(mem);
                  setOpen(false);
                }
              }}
            >
              <span className="flex-1 text-left">{m.name}</span>
              {(m as Member).password_hash && <Lock className="ml-1 h-3.5 w-3.5 opacity-60" />}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { setOpen(false); setRenaming(true); }}
          >
            <Pencil className="mr-2 h-4 w-4" /> Change my name
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <PasswordPrompt
      member={pending}
      onClose={() => setPending(null)}
      onAuthed={(id) => { setStoredMemberId(id); setPending(null); }}
    />
    <RenameDialog
      member={current}
      open={renaming}
      onOpenChange={setRenaming}
      onRenamed={() => { /* react-query will refetch on next mount; trigger immediately */ }}
    />
    </>
  );
}
