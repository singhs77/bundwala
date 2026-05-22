import { Link } from "@tanstack/react-router";
import { CurrentMemberBadge, MemberGate } from "./MemberPicker";
import { BottomNav } from "./BottomNav";
import { Settings } from "lucide-react";

export function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <MemberGate>
      <div className="mx-auto flex min-h-[100svh] max-w-xl flex-col">
        <header
          className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 pb-3 backdrop-blur"
          style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
        >
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Group Tracker
            </p>
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <CurrentMemberBadge />
            <Link
              to="/admin"
              className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Admin"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
        <BottomNav />
      </div>
    </MemberGate>
  );
}
