import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setStoredMemberId, useMe } from "@/lib/me";
import { Button } from "@/components/ui/button";
import { ChevronDown, UserCircle2 } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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

export function MemberGate({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const { data: members, isLoading } = useMembersQuery();

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
            Pick your name to start logging.
          </p>
        </div>
        <div className="grid w-full max-w-sm grid-cols-2 gap-2">
          {members?.map((m) => (
            <Button
              key={m.id}
              variant="secondary"
              className="h-12 justify-start"
              onClick={() => setStoredMemberId(m.id)}
            >
              <UserCircle2 className="mr-2 h-5 w-5" />
              {m.name}
            </Button>
          ))}
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function CurrentMemberBadge() {
  const me = useMe();
  const { data: members } = useMembersQuery();
  const current = members?.find((m) => m.id === me);
  const [open, setOpen] = useState(false);
  if (!current) return null;
  return (
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
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {members?.map((m) => (
            <Button
              key={m.id}
              variant={m.id === me ? "default" : "secondary"}
              className="h-11 justify-start"
              onClick={() => {
                setStoredMemberId(m.id);
                setOpen(false);
              }}
            >
              {m.name}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
