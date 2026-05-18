## Goal
Wipe all activity logs and seed per-member baseline scores from the screenshot so the standings start at those exact numbers.

## 1. New table: `baseline_scores`
Schema migration:
- `member_id uuid PRIMARY KEY` (one row per member)
- `gym numeric NOT NULL DEFAULT 0`
- `macros numeric NOT NULL DEFAULT 0`
- `deep_work numeric NOT NULL DEFAULT 0`
- `sleep numeric NOT NULL DEFAULT 0`
- RLS: public read; no write policies (seeded server-side via insert tool).

## 2. Seed baselines (from screenshot)
Insert one row per member:

| Member | Gym | Macros | DW | Sleep |
|---|---|---|---|---|
| Chic Boy GL | 0 | 0 | 2.6 | 2.6 |
| Milan | 0 | 0 | 0.4 | 2.8 |
| Saju Thou | 0 | 0 | 0.2 | 1.8 |
| Twin GL | 0 | 0 | 2.4 | 2.6 |
| Dr GL | 0 | 0 | 1.6 | 2.2 |
| Kazekage | 0 | 0 | 0.4 | 1.2 |
| Shaad Paji | 0 | 0 | 0.6 | 3 |
| Chic Mun | 0 | 0 | 1.4 | 1.6 |
| Arneet | 0 | 0 | 1.4 | 2.4 |
| Baby GL | 0 | 0 | 2.2 | 1.2 |
| Zoro Twin | 0 | 0 | 0.4 | 1.8 |
| Trolla Singh | 0 | 0 | 0.6 | 1.2 |
| Dillski | 0 | 0 | 0.4 | 0.4 |

## 3. Clear all log tables
`DELETE FROM dw_comments; DELETE FROM gym_logs; DELETE FROM sleep_logs; DELETE FROM deep_work; DELETE FROM macros_logs;`

## 4. Frontend changes (`src/routes/index.tsx`)
- Fetch `baseline_scores` alongside the rest of the leaderboard data.
- In the `scores` memo, add baseline values onto each category AFTER `applyCap`, then recompute `total`. This way baselines are a flat starting offset and live logs add on top, uncapped by the baseline portion.
- Keep `teamTotals` / `leaderTeamId` logic unchanged — they read from `scores`.

## Notes
- Free-agent "Dillski" baseline is included but won't roll into any team total (no `team_id`), matching the screenshot.
- Future edits to baselines can be done by re-inserting with `ON CONFLICT (member_id) DO UPDATE`.