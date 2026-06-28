## Plan: individual contest + bans + hot seat

### 1. Remove the team aspect from the UI

The `teams` table stays in the DB (members.team_id stays for history), but the UI becomes a flat individual leaderboard.

- **`src/routes/index.tsx`** — replace the per-team collapsible list with a single flat ranking of all non-demo, non-banned members sorted by total points. Keep the month picker, the Top 3 podium, and the "Most Dogshit Player" card. Drop `teams`, `teamTotals`, `leaderTeamId`, `openTeams`, and the free-agent filter logic (no longer needed once teams aren't shown). Each row: rank, avatar/name, per-category scores, total — linked to the member detail page like today.
- **`src/components/app/MemberPicker.tsx`** — remove the "Team" section from the profile/rename dialog (the team buttons and `member_set_team` call). Keep name + avatar editing.
- **`src/routes/admin.tsx`** — if it has team management UI, hide it. (I'll verify when implementing; teams table itself is left alone.)

No DB migration needed for the team removal — it's purely a UI change.

### 2. Ban Milan, Saju Thou, and Dillski

Soft ban so audit history and old logs stay intact.

**Migration:**
- Add `members.is_banned boolean not null default false` and `members.ban_message text`.
- Set `is_banned = true` and `ban_message = 'you got too much bread you dont need this shit'` for the three members by id.
- Update `member_verify_password` and `member_set_password` to check `is_banned` first and `RAISE EXCEPTION 'banned: <ban_message>'` so the client can show the exact message.
- Update `demo_login` — no change needed (TESTER is not banned).
- Also revoke any active sessions for those three (`DELETE FROM member_sessions WHERE member_id IN (...)`).

**Client:**
- `useMembersQuery` in `MemberPicker.tsx` — filter out `is_banned = true` so they don't appear in the picker grid at all. (Belt-and-suspenders: even if someone hits the RPC directly, the server still blocks them.)
- `PasswordPrompt.submit` — when the RPC error message starts with `banned:`, show the ban message via toast instead of the generic "Wrong password" path.
- `src/routes/index.tsx` standings query — filter `is_banned = false` so banned members never appear in the rankings, podium, or "Most Dogshit Player".

### 3. Hot seat + auto-removal

**Rules**
- A "missed day" for a category = no entry for that date in that category, excluding global `free_days` and (for sleep) the member's `sleep_logs.free_day`.
- Count is computed for **completed days only** (yesterday and earlier — today doesn't count as missed yet).
- **Under hot seat** = 3+ consecutive missed days in any one of gym / sleep / macros / deep_work, counting back from yesterday.
- **Auto-removed (banned)** = 5+ consecutive missed days in any one category — same ban flow as the three names above, with `ban_message = 'Removed for missing 5 consecutive days.'`

**Server (new SECURITY DEFINER functions, in the same migration):**
- `member_inactivity_streaks(_member_id uuid) returns table(category text, missed_streak int)` — for each of the 4 categories, returns the current consecutive-missed-days streak ending yesterday, honoring `free_days` and per-member sleep free days. Pure read.
- `enforce_inactivity_bans() returns int` — iterates active (non-banned, non-demo) members, calls the streak function, and for any member with `max(missed_streak) >= 5` sets `is_banned = true`, `ban_message = 'Removed for missing 5 consecutive days.'`, and deletes their `member_sessions`. Returns count banned.

**Client:**
- `src/routes/index.tsx`:
  - Add a query that calls `member_inactivity_streaks` per visible member (or a single batched RPC `members_inactivity_overview()` that returns each member's worst streak — preferred to avoid N round-trips; I'll add this as the actual RPC).
  - On mount, fire-and-forget `enforce_inactivity_bans()` so removals happen passively when anyone loads standings. (Cheap; idempotent.)
  - Render a small "Under hot seat" pill next to any member whose worst streak ≥ 3 (and < 5, since ≥5 will be banned out of the list).
  - Add a one-line legend below the podium explaining the rule: "Miss 3 days of gym / sleep / macros / deep work in a row → hot seat. Miss 5 in a row → removed."

### Files touched
- `src/routes/index.tsx` (flat leaderboard, hot-seat pill, ban-enforce call, legend)
- `src/components/app/MemberPicker.tsx` (drop team UI, filter banned, surface ban message)
- `src/routes/admin.tsx` (hide team management if present)
- One new SQL migration:
  - `members.is_banned`, `members.ban_message`
  - ban the 3 members + delete their sessions
  - update `member_verify_password` / `member_set_password` to block banned users
  - add `member_inactivity_streaks`, `members_inactivity_overview`, `enforce_inactivity_bans`
  - grants on the new functions

### Open questions for you before I build

1. **Auto-removal**: should crossing 5 missed days actually ban the member (they can no longer log in, removed from standings), or just show a stronger warning? My plan auto-bans — confirm.
2. **Hot-seat / removal threshold**: I'm reading "missed more than 2 consecutive days" as **3+ in a row** for hot seat, and "miss 2 [more] consecutive days" as **5+ in a row** for removal. OK?
3. **Re-entry for the 3 banned names**: leave permanent (admin-only un-ban via DB), or want an admin UI button to lift bans?
