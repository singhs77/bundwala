import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setSession, useMe, useSession, clearSession } from "@/lib/me";
import { Button } from "@/components/ui/button";
import { ChevronDown, UserCircle2, Lock, Pencil, LogOut, Upload } from "lucide-react";
import { useRef, useState } from "react";
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
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Member = {
  id: string;
  name: string;
  avatar_url: string | null;
  team_id: string | null;
  has_password: boolean | null;
};

export function useMembersQuery() {
  return useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, avatar_url, team_id, has_password, teams(*)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTeamsQuery() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, color")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

export function MemberAvatar({
  name,
  url,
  className = "h-8 w-8",
}: {
  name: string | null | undefined;
  url: string | null | undefined;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {url && <AvatarImage src={url} alt={name ?? ""} />}
      <AvatarFallback className="bg-secondary text-xs font-semibold uppercase">
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function PasswordPrompt({
  member,
  onClose,
  onAuthed,
}: {
  member: Member | null;
  onClose: () => void;
  onAuthed: (id: string, token: string) => void;
}) {
  const isSetup = !!member && !member.has_password;
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
    if (pw.length < 4) return toast.error("At least 4 characters");
    setBusy(true);
    try {
      let token: string | null = null;
      if (isSetup) {
        if (pw !== confirm) {
          setBusy(false);
          return toast.error("Passwords don't match");
        }
        const { data, error } = await supabase.rpc("member_set_password", {
          _member_id: member.id,
          _current_password: "",
          _new_password: pw,
        });
        if (error) throw error;
        token = data as unknown as string;
        toast.success("Password set");
      } else {
        const { data, error } = await supabase.rpc("member_verify_password", {
          _member_id: member.id,
          _password: pw,
        });
        if (error) throw error;
        token = data as unknown as string;
      }
      if (!token) throw new Error("No session token returned");
      onAuthed(member.id, token);
      reset();
    } catch (e: any) {
      const msg = String(e.message || e);
      toast.error(msg.includes("wrong_password") ? "Wrong password" : msg);
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
  open,
  onOpenChange,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRenamed: () => void;
}) {
  const session = useSession();
  const me = useMe();
  const { data: members } = useMembersQuery();
  const { data: teams } = useTeamsQuery();
  const current = members?.find((m) => m.id === me) as Member | undefined;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [teamBusy, setTeamBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const joinTeam = async (teamId: string | null) => {
    if (!session) return;
    setTeamBusy(teamId ?? "none");
    try {
      const { error } = await supabase.rpc("member_set_team", {
        _token: session.token,
        _team_id: teamId,
      } as never);
      if (error) throw error;
      toast.success(teamId ? "Joined team" : "Left team");
      onRenamed();
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setTeamBusy(null);
    }
  };

  const submit = async () => {
    if (!session) return;
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Enter a name");
    if (trimmed.length > 60) return toast.error("Name too long");
    setBusy(true);
    try {
      const { error } = await supabase.rpc("member_rename", {
        _token: session.token,
        _new_name: trimmed,
      });
      if (error) throw error;
      toast.success("Name updated");
      setName("");
      setBusy(false);
      onRenamed();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(String(e.message || e));
      setBusy(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!session || !current) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5 MB");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${current.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: rpcErr } = await supabase.rpc("member_set_avatar", {
        _token: session.token,
        _url: pub.publicUrl,
      });
      if (rpcErr) throw rpcErr;
      toast.success("Avatar updated");
      onRenamed();
    } catch (e: any) {
      toast.error(String(e.message || e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Change your name or avatar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <MemberAvatar
              name={current?.name}
              url={current?.avatar_url}
              className="h-16 w-16"
            />
            <div className="flex-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatar(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? "Uploading…" : "Upload photo"}
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="new-name">New name</Label>
            <Input
              id="new-name"
              autoFocus
              value={name}
              placeholder={current?.name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label>Team</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {teams?.map((t) => {
                const active = current?.team_id === t.id;
                return (
                  <Button
                    key={t.id}
                    type="button"
                    variant={active ? "default" : "secondary"}
                    size="sm"
                    className="justify-start"
                    disabled={teamBusy !== null}
                    onClick={() => joinTeam(active ? null : t.id)}
                  >
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="truncate">{t.name}</span>
                  </Button>
                );
              })}
            </div>
            {current?.team_id && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Tap your current team to leave it.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !name.trim()} className="w-full">
            Save name
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MemberGate({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const { data: members, isLoading } = useMembersQuery();
  const [pending, setPending] = useState<Member | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!session) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Who are you?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick your name. First time? You'll set a password to lock your profile.
          </p>
        </div>
        <div className="grid w-full max-w-sm grid-cols-2 gap-2">
          {members?.map((m) => {
            const mem = m as unknown as Member;
            return (
              <Button
                key={mem.id}
                variant="secondary"
                className="h-12 justify-start"
                onClick={() => setPending(mem)}
              >
                <MemberAvatar name={mem.name} url={mem.avatar_url} className="mr-2 h-6 w-6" />
                <span className="flex-1 truncate text-left">{mem.name}</span>
                {mem.has_password && <Lock className="ml-1 h-3.5 w-3.5 opacity-60" />}
              </Button>
            );
          })}
        </div>
        <PasswordPrompt
          member={pending}
          onClose={() => setPending(null)}
          onAuthed={(id, token) => {
            setSession({ memberId: id, token });
            setPending(null);
          }}
        />
      </div>
    );
  }
  return <>{children}</>;
}

export function CurrentMemberBadge() {
  const session = useSession();
  const me = session?.memberId ?? null;
  const { data: members } = useMembersQuery();
  const qc = useQueryClient();
  const current = members?.find((m) => m.id === me) as Member | undefined;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Member | null>(null);
  const [renaming, setRenaming] = useState(false);

  if (!current) return null;

  const signOut = async () => {
    try {
      if (session) {
        await supabase.rpc("member_logout", { _token: session.token });
      }
    } catch {
      // ignore — clearing local session anyway
    }
    clearSession();
    setOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button className="flex items-center gap-1.5 rounded-full bg-secondary py-1 pl-1 pr-2 text-sm font-medium">
            <MemberAvatar name={current.name} url={current.avatar_url} className="h-6 w-6" />
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
            {members?.map((m) => {
              const mem = m as unknown as Member;
              return (
                <Button
                  key={mem.id}
                  variant={mem.id === me ? "default" : "secondary"}
                  className="h-11 justify-start"
                  onClick={() => {
                    if (mem.id === me) {
                      setOpen(false);
                      return;
                    }
                    setPending(mem);
                    setOpen(false);
                  }}
                >
                  <MemberAvatar name={mem.name} url={mem.avatar_url} className="mr-2 h-5 w-5" />
                  <span className="flex-1 truncate text-left">{mem.name}</span>
                  {mem.has_password && <Lock className="ml-1 h-3.5 w-3.5 opacity-60" />}
                </Button>
              );
            })}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setOpen(false);
                setRenaming(true);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> Edit profile
            </Button>
            <Button variant="ghost" className="w-full" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PasswordPrompt
        member={pending}
        onClose={() => setPending(null)}
        onAuthed={(id, token) => {
          setSession({ memberId: id, token });
          setPending(null);
          qc.invalidateQueries();
        }}
      />
      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        onRenamed={() => qc.invalidateQueries({ queryKey: ["members"] })}
      />
    </>
  );
}
