## Goal

Add a new "Sobriety" tab, laid out like the Gym page, where each member does a daily check for weed, liquor and vape. Members can only log today and yesterday.

## How it works

- Day picker shows just 2 dates (e.g. "October 12th", "October 11th").
- Three rows: Weed, Liquor, Vape. Each row has two buttons: **Clean** (green) or **Used** (red). You pick one per row.
- Mini calendar for the current month: a green day means clean on all three, red means used at least one, grey means not logged.
- "Clean days this month" counter.
- An "Everyone's sobriety" list (same as Gym): today's status for each person, plus their monthly history when you tap them.
- The server blocks changes to any date other than today or yesterday.
- **No points on the standings for now.** We can add scoring later if you want it.

## Bottom bar

Add a 6th tab, "Sober", with a leaf icon, after Macros.

## Technical details

- Migration: new `sobriety_logs` table (member_id, date, weed bool, liquor bool, vape bool, unique per member+date). Bools are nullable, and true means used. Public read like the other logs, with GRANT SELECT for anon/authenticated. Writes only go through a `log_sobriety(_token, _date, _substance, _used)` SECURITY DEFINER RPC, which checks the session and only allows today or yesterday. Include the audit trigger.
- New route `src/routes/sobriety.tsx` built on `MemberFeed`, the same way as `gym.tsx`.
- Update `BottomNav.tsx` and regenerate types.

## Open question

Should "Used" vs "Clean" be the choice for each substance (planned above), or do you want one pick per day out of the three?
