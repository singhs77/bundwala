## Changes

### 1. Macros scoring — require all 4 macros
A macros day only counts toward points if **calories, protein, carbs, and fat** are all logged. Sugar and water stay optional and never affect points.

- `src/routes/index.tsx`: change the `macrosDates` set to filter rows where all four fields are non-null (currently it only checks `calories`).
- Rate stays the same: `5 / daysInMonth` per qualifying day, capped at 5.
- May snapshot is already frozen, so May totals don't change. Current month auto-recomputes — anyone missing carbs/fat on a given day loses that day's macro credit (this includes **Trolla Singh**, who has 4 days logged this month with only calories + protein; he'll drop to 0 macros for June until he starts logging all four).

> Heads up: I don't see a member named "J Star" — the only person matching your description (calories + protein only, no carbs/fat) is **Trolla Singh**. If J Star is a nickname for someone else, tell me which member and I'll confirm.

### 2. Water field → free text
- DB: alter `macros_logs.water` from `integer` to `text`. Existing numeric values are preserved as strings (e.g. `2000` → `"2000"`).
- RPC: update `log_macros` so `_water` is `text` (drop the numeric range check on water).
- `src/routes/macros.tsx`: water `<Input>` becomes a plain text box (no `inputMode="numeric"`), label reads `Water (optional)`, sugar label reads `Sugar (optional)`.
- "This week's averages": skip water in the averages grid since it's no longer numeric (or just show the count of days logged). I'll go with hiding water from the averages grid to keep it simple.
- `src/integrations/supabase/types.ts` will auto-regen after the migration.

### 3. Deep Work = 0.3/day, Sleep = 0.1/day
Mirror the gym/macros pattern in `src/routes/index.tsx`:
- `deep_work: Math.min(dwCount * 0.3, 5)`
- `sleep: Math.min(sleepCount * 0.1, 5)`
- Stop using `applyCap` + `scoring_rules` for these two categories (the gym/macros categories already bypass it). The `scoring_rules` table stays in place for the admin page to keep editing, but the leaderboard ignores it for these four categories — same as today for gym/macros.

> Caps: with 0.1/day, sleep effectively maxes at ~3 over a 30-day month (cap of 5 is never hit). With 0.3/day, DW caps at 5 after ~17 days. If you'd rather no cap at all, say the word.

### 4. Out of scope
- No changes to gym scoring, free days, snapshots, admin page, or auth.
- May snapshot untouched.

## Technical details

- Migration: `ALTER TABLE macros_logs ALTER COLUMN water TYPE text USING water::text;` then `CREATE OR REPLACE FUNCTION log_macros(...)` with `_water text` and the water range check removed.
- `index.tsx` scores `useMemo`: replace the `macrosDates` Set filter with `x.calories != null && x.protein != null && x.carbs != null && x.fat != null`; replace the `applyCap(...)` calls for `deep_work` and `sleep` with the per-day formulas above; `pointsPerDay` (5/daysInMonth) stays only for gym + macros.
- `macros.tsx`: change `vals` typing so `water` is `string` end-to-end; `save.mutate` passes `vals.water === "" ? null : vals.water` to the RPC; remove water from the `avgs` computation/grid.
