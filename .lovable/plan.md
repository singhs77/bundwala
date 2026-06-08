## What we're building

1. A **per-member logs page** (`/members/$memberId`) that shows one person's activity for the current month at a glance — visible to anyone signed in.
2. A **calorie goal** field on the macros page (one goal per member, stored on `members`). It's just captured for now — no scoring change yet.

---

## 1. Member Logs page

### How you get there
- On Standings, every member row becomes a `<Link>` to `/members/$memberId`.
- The page has a back button and a month picker (defaults to current month, same chevrons as Standings).

### What it shows (top to bottom)

**Header**
- Avatar + name + team
- This month's total points (same formula as Standings) with a per-category breakdown chip row: Gym · DW · Sleep · Macros.

**Gym** — `5 / daysInMonth × 0.2` per qualifying day
- A 7-column calendar grid for the month. Each cell is a dot:
  - Filled green = `yes` or `home`
  - Outline red = `no`
  - Empty = no log
- Below: count like "12 / 30 days".

**Deep Work** — 0.3/day
- Vertical list of entries this month, newest first: `Jun 7 · 45 min · "Topic"` → tap to expand and show learnings + personal notes (uses existing `dw_comments` schema, read-only here).
- Empty state: "No deep work logged this month."

**Sleep** — 0.1/qualifying day
- Per-day rows for days with a log or a free day: `Jun 7 · 11:15 PM → 7:00 AM · 7.75h` with an "on time" / "off" pill (uses existing target-buffer / 7h fallback logic from `score.ts`).
- Free days show a "Free day" badge instead of times.

**Macros**
- Two stat cards side by side: **This week's avg** (Sun–Sat) and **This month's avg** for calories / protein / carbs / fat / sugar. Water shown as "X days logged" since it's free text now.
- Below: count of days that qualified for points (all 4 of calories/protein/carbs/fat present).
- If the member has a calorie goal set, show it under the calorie stat as "Goal: 2400" with a small badge showing how many qualifying days were within ±100 of goal — informational only this month, not scored.

### Data
One TanStack Query query that batches: `members` (one row), `teams`, `gym_logs`, `deep_work`, `dw_comments`, `sleep_logs`, `sleep_targets`, `macros_logs`, `free_days` — all filtered to that `member_id` and the visible month. Same realtime subscription pattern as Standings (`postgres_changes` on the activity tables, debounced invalidate).

---

## 2. Calorie goal on macros page

- New column `members.calorie_goal int` (nullable).
- New RPC `member_set_calorie_goal(_token uuid, _goal int)` with 0–20000 range check.
- On `/macros`: a small "Daily calorie goal" input above the day's form, with a Save button (separate from the per-day macros save). Shows current value, persists on save.
- Goal is **not** wired into scoring yet — that's a separate change. Plan body note for later: once the goal exists for everyone we want, switch macros scoring to require all 4 logged AND calories within ±100 of goal.

---

## Out of scope
- No changes to gym / deep-work / sleep scoring.
- No edit/delete of someone else's logs from the new page — view only.
- No "compare two members" view.
- No historical past-month browsing beyond the month picker (which is already there for parity with Standings).

---

## Technical details

- **Route**: `src/routes/members.$memberId.tsx` → `createFileRoute("/members/$memberId")`. Public route, no auth gate.
- **Standings**: in `src/routes/index.tsx`, wrap each member `<li>` content in `<Link to="/members/$memberId" params={{ memberId: m.id }}>`. Keep the existing grid styling on the inner element.
- **Data hook**: a single `useQuery({ queryKey: ["member-logs", memberId, monthISO] })` that runs all reads in `Promise.all`. Reuses `daysOfMonth`, `startOfMonth`, `endOfMonth`, `startOfWeek`, `endOfWeek`, `toISODate` from `src/lib/week.ts`, and `withinTimeBuffer` from `src/lib/score.ts`.
- **Migrations** (two, in one migration file):
  1. `ALTER TABLE public.members ADD COLUMN calorie_goal int;`
  2. `CREATE OR REPLACE FUNCTION public.member_set_calorie_goal(_token uuid, _goal int) ...` — validates token via `_member_from_token`, range-checks `_goal` (NULL allowed to clear, otherwise 0–20000), updates `members.calorie_goal`. `SECURITY DEFINER`, `SET search_path = public`. Then `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated, anon;` to match the pattern of the other member RPCs.
- **Types**: `src/integrations/supabase/types.ts` regenerates after the migration runs.
- **Macros page** (`src/routes/macros.tsx`): add a small `calorie_goal` form section that reads from the existing `useMe()` member row and calls the new RPC. Add the goal display to the averages card when present.
- **Realtime**: subscribe to the same five tables as Standings (`gym_logs`, `sleep_logs`, `macros_logs`, `deep_work`, `free_days`) plus `members` for the goal field, scoped to the page's `memberId` via `filter: member_id=eq.<id>` where supported.
