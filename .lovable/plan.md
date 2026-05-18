# Pre-launch fix plan

Skipping #9 (notifications) per your call. Everything else, grouped into 3 milestones so each step is verifiable before moving on.

---

## Milestone 1 — Lock the backend down (#1, #2, #6)

The biggest risk. Done in one migration + one code pass.

**Database migration**
- Enable `pgcrypto` for bcrypt password hashing.
- New table `member_sessions(token uuid pk, member_id, expires_at)` — 30-day rolling sessions.
- Server-side RPC functions (SECURITY DEFINER, bypass RLS safely):
  - `member_set_password(member_id, current_password, new_password)` — bcrypt, verifies old password if one exists, returns new session token.
  - `member_verify_password(member_id, password)` — returns session token or null.
  - `member_rename(token, new_name)`.
  - `log_gym(token, date, status)`, `log_sleep(...)`, `log_macros(...)`, `log_deep_work(...)`, `add_dw_comment(...)`.
- RLS lockdown:
  - `members`: SELECT allowed for the safe columns only (id, name, team_id, avatar_url) via a `members_public` view; direct UPDATE/DELETE denied. `password_hash` no longer readable.
  - All activity tables (`gym_logs`, `sleep_logs`, `macros_logs`, `deep_work`, `dw_comments`): SELECT stays public (group feed), INSERT/UPDATE/DELETE denied to anon — mutations must go through the RPC functions, which verify the session token.
  - `scoring_rules`, `free_days`: SELECT public, writes require an admin token (we'll seed one admin password for you).
- Add the activity tables to `supabase_realtime` publication for #6.

**Frontend refactor**
- New `src/lib/session.ts`: stores `{ memberId, token }` in localStorage. `useMe()` exposes both.
- All `.upsert/.insert/.delete` calls in gym/sleep/macros/deep-work/admin/MemberPicker swap to `supabase.rpc("...")` with the token.
- Leaderboard subscribes to realtime channels on the 4 activity tables and invalidates the query on any change.

**Caveat**: existing password hashes are unsalted SHA-256. The migration will re-hash on next login (one-time prompt: "for security, please re-enter your password"). No data loss.

---

## Milestone 2 — Data entry UX (#3, #4, #5, #8)

- **Date picker on Gym, Sleep, Macros** — defaults to today, lets you backfill any past date. Shadcn `Popover + Calendar`.
- **Validation** — zod schema on macros (0–10000 int, no NaN), deep-work minutes (1–600), sleep hours (computed, capped 0–16). Friendly inline errors instead of DB errors.
- **Stop `useEffect` clobbering input** — only seed local state once per date change, not on every refetch (`useRef` guard).
- **Historical view** for Sleep and Macros — same week-nav pattern as Leaderboard.

---

## Milestone 3 — Polish (#7, #10)

- Skeleton loaders on Gym, Macros, Deep Work, Sleep.
- Empty states for the 14-day gym grid and macros averages.
- **Avatars**: create `avatars` storage bucket (public read, member-scoped writes via RPC). Upload UI in the rename dialog. Initials fallback everywhere `members.name` is displayed (leaderboard, deep work feed, badge).
- Fix tied-leader bug (multiple teams highlighted when tied).

---

## Tech notes (skip if not interested)

- All RPCs take `token uuid` as first arg; the function resolves `member_id` from `member_sessions` and rejects expired sessions. This makes "users can only edit their own data" enforced at the DB level — even if someone opens the JS console.
- The `members_public` view is used everywhere the UI lists members. The raw `members` table is locked.
- Realtime: client subscribes once per active leaderboard page; on any insert/update/delete it calls `queryClient.invalidateQueries(["leaderboard"])` (debounced 500ms to avoid spam).
- Admin token: I'll seed it with a default password ("changeme") and surface a one-time setup screen the first time you visit `/admin`.

---

## Order of operations

1. M1 migration + frontend refactor → test logging works as your own user, can't write as someone else.
2. M2 → backfill missed days, validation catches garbage.
3. M3 → looks polished, avatars show up.

After approval I'll start with M1. Roughly 3 tool-heavy turns total.