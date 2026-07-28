## Goal

Let each member set their own sleep target (bedtime + wake time) from the Sleep page, and lock the target for 1 month after any change so people can't game the ±90-min buffer daily.

## Changes

### 1. Database

- Add `sleep_targets.updated_at timestamptz not null default now()` (nullable-safe backfill to `now()` for existing rows).
- New RPC `member_set_sleep_target(_token uuid, _sleep time, _wake time)`:
  - Resolves member from token.
  - Loads existing row. If it exists and `updated_at > now() - interval '1 month'`, raise `target_locked` with the unlock date encoded (e.g. `target_locked:2026-08-27`).
  - Otherwise upserts `target_sleep`, `target_wake`, `updated_at = now()`.
- Add friendly mapping for `target_locked` in `src/lib/rpc.ts` → "You can change your sleep target again on <date>."

### 2. UI — `src/routes/sleep.tsx`

Replace the read-only "Your target" card with an editable panel:

- Shows current target (or "Not set").
- Two time inputs (sleep / wake) + Save button.
- If the target is locked (updated within last month):
  - Inputs disabled.
  - Small note: "Locked until <date> — you can change it once per month."
- If unlocked:
  - Save calls the new RPC, invalidates `sleep-target` + `sleep-month`, shows toast.
- Keep the ±90 min buffer explainer.

No changes to scoring, other members' targets, or the log flow.

### Technical notes

- Files: 1 migration, `src/lib/rpc.ts`, `src/routes/sleep.tsx`.
- "1 month" = `interval '1 month'` (calendar month), computed server-side so client clock can't cheat.
- First-time set (no existing row) is always allowed — the lock only starts after the first save.
