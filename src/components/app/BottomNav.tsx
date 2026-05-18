import { Link, useLocation } from "@tanstack/react-router";
import { Trophy, Dumbbell, BookOpen, Moon, Apple } from "lucide-react";

const items = [
  { to: "/", label: "Standings", icon: Trophy },
  { to: "/gym", label: "Gym", icon: Dumbbell },
  { to: "/deep-work", label: "Deep Work", icon: BookOpen },
  { to: "/sleep", label: "Sleep", icon: Moon },
  { to: "/macros", label: "Macros", icon: Apple },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <ul className="mx-auto flex max-w-xl items-stretch justify-between px-2 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active = pathname === it.to;
          return (
            <li key={it.to} className="flex-1">
              <Link
                to={it.to}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
