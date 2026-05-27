## Goal

Import historical **Sleep Log** and **Deep Work Log** tabs from your Google Sheet into the app's `sleep_logs` and `deep_work` tables so existing sheet users see their history when they sign in.

## How you give me the data

Export the Google Sheet as `.xlsx` and upload it here. I'll parse the two tabs locally with DuckDB/pandas — no Google connector or live link.

## Member matching

- Build a list of distinct member names found in the Sleep and Deep Work tabs.
- Look them up in `public.members` by name (case-insensitive, trimmed).
- **If any name is missing, I stop and show you the unmatched list** so you can either rename them in the sheet, create the missing members in the app first, or give me a name → member mapping. Nothing gets inserted until every name resolves.

## Conflict rule

For every `(member, date)` pair from the sheet, only insert if no row already exists in the target table. Existing app data is never touched. Re-runnable safely.

## "Missing day = None"

I don't insert rows for blank days. The app already renders missing days as no entry / no score, which is the "None" behavior you want. No empty placeholder rows needed.

## Per-tab mapping

**Sleep Log → `sleep_logs`**
- Columns expected per row: member name, date, and at least one of: hours, sleep time, wake time.
- If only sleep/wake times are present, I'll compute `hours` (handling overnight wraps).
- If only hours are present, sleep_time/wake_time stay null.
- Insert via the existing `INSERT ... ON CONFLICT (member_id, date) DO NOTHING` shape.

**Deep Work Log → `deep_work`**
- Columns expected per row: member name, date, topic (optional), minutes, learnings (optional), notes (optional).
- One sheet row = one `deep_work` entry. (Unlike sleep, this table allows multiple per day, so "skip if exists" applies per-date: I'll skip the whole date for a member if they already have any deep_work row that day, to avoid double-importing.)
- `started_at` / `finished_at` synthesized from `date` + `minutes` (end of day backed out by minutes), same pattern as `log_deep_work` RPC.

## What I'll do once you upload

1. Open the `.xlsx`, dump the two tabs' headers and a few sample rows back to you so we confirm the column mapping before any writes.
2. Extract distinct names; verify every name maps to a `members.id`. If not, stop and show the gaps.
3. Generate one SQL insert batch per tab (parameterized, chunked) and run it via the insert tool. Skip-if-exists logic is in the SQL itself.
4. Report: rows inserted per tab, rows skipped as duplicates, date range covered, per-member counts.

## Out of scope (per your call)

- Scoreboard tab (derived from logs — will populate automatically).
- Gym tab.
- Avg Weekly Macros tab.

We can add those later with the same flow if you want.
