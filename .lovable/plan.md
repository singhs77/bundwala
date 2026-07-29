## Goal

1. Give Twin GL a one-off +0.4 sleep bonus (like the existing deep-work bonus system).
2. Make sleep target changes non-retroactive: past days keep the target that was active when they were logged; only future logs use the new target.

## Changes

### 1. Snapshot targets on `sleep_logs`

- Migration: add `target_sleep time` and `target_wake time` columns to `public.sleep_logs` (nullable).
- Backfill existing rows with the member's CURRENT `sleep_targets` values so today's scoring stays identical to right now (this "freezes" everyone's history at the current target).
- Update `log_sleep` RPC to copy the member's current `sleep_targets` values into the row on insert/update. Once a row exists with a snapshot, subsequent edits to that same date keep the original snapshot (only new dates pick up new targets).

### 2. Scoring reads the snapshot

Update all three consumers of `withinTimeBuffer(...)` for sleep to prefer `log.target_sleep/target_wake` over the live `sleep_targets` row, falling back to the live target only when the snapshot is null (legacy):

- `src/routes/index.tsx` (leaderboard scoring)
- `src/routes/sleep.tsx` (per-member hit/miss)
- `src/routes/members.$memberId.tsx` (member profile)

The live `sleep_targets` row is still used for the "Your target" editor and for the live "will this earn a point" preview while typing.

### 3. Twin GL sleep bonus

Create a new `public.sleep_bonuses` table mirroring `deep_work_bonuses`:

```text
sleep_bonuses(id, member_id, date, points numeric default 0.1, reason, created_at)
```

Public read, no public writes (admin-only via migrations), GRANTs on SELECT to anon/authenticated.

Insert one row: Twin GL, today, `points=0.4`, `reason='manual bonus'`.

Add `sleep_bonuses` into the leaderboard sleep total in `src/routes/index.tsx` the same way `deep_work_bonuses` is already summed.

### Technical notes

- 1 migration (schema + backfill + RPC update + table + grants + policies + insert of Twin GL bonus).
- Files: `src/routes/index.tsx`, `src/routes/sleep.tsx`, `src/routes/members.$memberId.tsx`, plus regenerated types after migration.
- No UI changes to the sleep editor; the 1-month lock stays as-is.
