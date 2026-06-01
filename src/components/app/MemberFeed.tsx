import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export type FeedMember = { id: string; name: string };

export function MemberFeed({
  title,
  members,
  renderToday,
  renderHistory,
}: {
  title: string;
  members: FeedMember[];
  renderToday: (memberId: string) => ReactNode;
  renderHistory: (memberId: string) => ReactNode;
}) {
  const [personFilter, setPersonFilter] = useState<string>("all");
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const sorted = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );
  const visible = useMemo(
    () => (personFilter === "all" ? sorted : sorted.filter((m) => m.id === personFilter)),
    [sorted, personFilter],
  );

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      </div>
      <Select value={personFilter} onValueChange={setPersonFilter}>
        <SelectTrigger>
          <SelectValue placeholder="Filter by person" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Everyone</SelectItem>
          {sorted.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ul className="mt-3 space-y-2">
        {visible.length === 0 && (
          <li className="rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            No members.
          </li>
        )}
        {visible.map((m) => {
          const isFiltered = personFilter !== "all";
          const open = isFiltered ? true : (openMap[m.id] ?? false);
          return (
            <li key={m.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <Collapsible
                open={open}
                onOpenChange={(o) =>
                  !isFiltered && setOpenMap((prev) => ({ ...prev, [m.id]: o }))
                }
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    disabled={isFiltered}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{m.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Today</div>
                      <div className="mt-1">{renderToday(m.id)}</div>
                    </div>
                    {!isFiltered && (
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                      />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-border px-4 py-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      This month
                    </div>
                    {renderHistory(m.id)}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
      </ul>
    </section>
  );
}