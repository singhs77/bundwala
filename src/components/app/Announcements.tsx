import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone } from "lucide-react";

export function Announcements() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, body, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("announcements-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => qc.invalidateQueries({ queryKey: ["announcements"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  if (!data || data.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      {data.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3"
        >
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              Announcement
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{a.body}</p>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {new Date(a.created_at).toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}