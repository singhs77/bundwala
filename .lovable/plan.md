Insert a row into `macros_logs` for Chic Mun on 2026-06-05:

- member_id: `dfc2f2f9-502b-42d5-a952-560137f41831` (Chic Mun)
- date: 2026-06-05
- calories: 3261
- protein: 253
- carbs: 320
- fat: 93
- sugar/water: left null

Uses upsert on (member_id, date) so it overwrites if a row already exists. No code/schema changes — data-only.