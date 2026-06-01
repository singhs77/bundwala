## Goal

1. Replace the flat "Everyone's logs" lists at the bottom of **Gym**, **Sleep**, and **Macros** with a Deep-Work–style person-filtered view that shows today's status by default and expands to full history.
2. Make the **Standings** leaderboard a true per-month score: June shows only June, May only May, and there are no carry-over baselines.

## 1. Per-category social view (Gym / Sleep / Macros)

Pattern, mirroring `src/routes/deep-work.tsx`:

- Add a `Select` person filter above the everyone-list. Options: **Everyone** + each member.
- Default view (today-only): one card per member showing **today's** status for that category.
  - **Gym**: Hit it / Home / Skipped pill (or "Not logged yet" muted).
  - **Sleep**: hours + sleep→wake times, plus a ✓/✗ pill for whether the target/7h bar was hit (use the same logic as `index.tsx`: free day, within ±90 min of target, or ≥7h fallback).
  - **Macros**: calories + P/C/F line (or "Not logged yet").
- Each card has a chevron / "Show history" toggle. Expanded, it lists that member's logs for the current month (newest first) with the same per-day status pill.
- When the filter is set to a specific person, auto-expand their card and hide everyone else.
- Keep the existing "log your own entry" sections at the top of each page unchanged. Only the bottom "Everyone's …" section changes.

Data:
- Fetch `members(id, name)` once.
- Fetch the category logs for the current month (`gym_logs` / `sleep_logs` / `macros_logs`) for all members in a single query, instead of the current `.limit(30)` flat fetch.
- Derive "today's row" and "history rows" per member in memory.

No DB or RPC changes — all existing tables and policies stay as-is.

## 2. Monthly score reset on Standings

In `src/routes/index.tsx`:

- Remove the `baseline_scores` addition from the per-member score computation. Each month's total is built purely from that month's `gym_logs`, `deep_work`, `sleep_logs`, `macros_logs`, and `free_days` (which are already filtered by `ws`/`we`).
- Drop the `baselines` fetch from the leaderboard query.
- "Most Dogshit Player" automatically becomes month-scoped too (it already reads from `scores`).
- Navigating to a previous month via the existing chevrons will now show only that month's points; the current month starts everyone at 0 on day 1.

No migration needed. `baseline_scores` table is left in place but unused by the leaderboard (admin tools that write to it, if any, are not touched).

## Files changed

- `src/routes/gym.tsx` — replace bottom section with filterable per-member today + expandable history.
- `src/routes/sleep.tsx` — same pattern; reuse `withinTimeBuffer` for the hit/miss pill.
- `src/routes/macros.tsx` — same pattern.
- `src/routes/index.tsx` — drop baseline addition and the baselines fetch.
- (Optional) extract a small shared `MemberLogList` component into `src/components/app/` if the three pages end up duplicating the same scaffolding.

## Out of scope

- No changes to logging RPCs, scoring rules, or DB schema.
- Deep Work tab stays as-is.
- `baseline_scores` table is not dropped (kept for admin tooling); it's just no longer added into standings.
