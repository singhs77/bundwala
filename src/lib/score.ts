import type { Database } from "@/integrations/supabase/types";

export type Rule = { category: string; points_per_entry: number; weekly_cap: number };
export type Member = Database["public"]["Tables"]["members"]["Row"];
export type Team = Database["public"]["Tables"]["teams"]["Row"];

export type CategoryScores = {
  gym: number;
  deep_work: number;
  sleep: number;
  macros: number;
  total: number;
};

export function applyCap(count: number, rule?: Rule): number {
  if (!rule) return 0;
  const raw = count * Number(rule.points_per_entry);
  return Math.min(raw, Number(rule.weekly_cap));
}

export function emptyScores(): CategoryScores {
  return { gym: 0, deep_work: 0, sleep: 0, macros: 0, total: 0 };
}

export function sumTotal(s: Omit<CategoryScores, "total">): number {
  return Number((s.gym + s.deep_work + s.sleep + s.macros).toFixed(2));
}

/**
 * Returns true if `actual` (HH:MM[:SS]) is within `bufferMin` minutes of `target`,
 * treating both as times-of-day (wraps across midnight).
 */
export function withinTimeBuffer(
  actual: string | null | undefined,
  target: string | null | undefined,
  bufferMin = 90,
): boolean {
  if (!actual || !target) return false;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const diff = Math.abs(toMin(actual) - toMin(target));
  const wrapped = Math.min(diff, 1440 - diff);
  return wrapped <= bufferMin;
}
