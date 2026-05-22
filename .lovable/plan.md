## 1. Fix iOS top cutoff (Home Screen install)

In `src/components/app/AppShell.tsx`, add safe-area padding to the sticky header so the status bar / notch doesn't cover it:

- Wrap the outer container with `pt-[env(safe-area-inset-top)]` and `min-h-[100svh]`.
- Header gets `pt-[max(env(safe-area-inset-top),0.75rem)]` so the title sits below the iOS status bar when launched standalone.

(Bottom nav already handles `safe-area-inset-bottom`.)

## 2. Admin-controlled daily reminder (global)

Remove per-user time picker; admin picks one time + message that goes to everyone.

**DB migration** — new table `notification_settings` (single row, id=1):
- `reminder_time time` (default `20:00`)
- `reminder_title text` (default "Daily check-in")
- `reminder_body text` (default "Don't forget to log gym and macros today.")
- `last_sent_date date` (so the cron only fires once/day)

New RPCs (security definer):
- `admin_get_notification_settings()` — public read.
- `admin_update_notification_settings(_password, _time, _title, _body)` — admin-gated.
- Replace `list_due_reminders()` so it returns ALL enabled subscriptions when current UTC ≥ today's `reminder_time` (treated as UTC for simplicity — group is local enough) AND `last_sent_date <> today`, then bumps `last_sent_date`.
- Drop the per-subscription `reminder_local_time` usage in scheduling (keep column for backward compat but ignore).

**Server function** — update `sendDueReminders` in `src/lib/push.functions.ts` to fetch settings, send `{title, body}` from DB, and mark the global `last_sent_date` afterwards.

**UI**:
- `src/components/app/PushSettings.tsx` becomes a simple Enable/Disable toggle (no time picker). Shows "Daily reminders are sent at HH:MM by the admin".
- `src/routes/admin.tsx` gets a new section "Daily reminder" with time picker, title, message, save (password-protected like other admin actions).

## 3. Announcements board on Standings page

**DB migration** — new table `announcements`:
- `id uuid pk`, `body text`, `created_at timestamptz default now()`.
- RLS: public select. Mutations via RPC only.
- `admin_post_announcement(_password, _body)` and `admin_delete_announcement(_password, _id)`.

**UI**:
- `src/components/app/Announcements.tsx`: fetches latest 10, renders list of cards above the leaderboard. Subscribed via realtime for live updates.
- `src/routes/index.tsx`: render `<Announcements />` right under the month switcher, above `<PushSettings />`.
- `src/routes/admin.tsx`: new "Announcements" section — textarea + post button, plus list of existing with delete buttons (password reused from other admin forms via a local input).

## 4. New macros scoring

Replace the "1.25 per Sat→Fri full week, cap 5" logic in `src/routes/index.tsx`.

New rule (client-side calc, no DB change):
- `pointsPerLog = daysInMonth / 5` (e.g. 30-day → 6.0, 31-day → 6.2, 28-day → 5.6).
- A "log" = a `macros_logs` row in the current month for that member where `date` is **today or yesterday relative to when it was created** — interpreted as: only logs for current month dates count, one point unit per dated log, capped at **5 pts total / month**.
- Implementation: count distinct dates the member has a macros row in the visible month → `Math.min(count * (daysInMonth / 5), 5)`. This naturally caps after a few logs (5 logs in a 30-day month maxes the category).

Effectively: log a couple days = max out macros. Matches the "capped at 5 total" answer.

Note: the "today or yesterday" gating already lives in the macros UI (only those two buttons exist), so any row in `macros_logs` was created via that flow. No backend enforcement needed.

## Technical summary

Files touched:
- `src/components/app/AppShell.tsx` — safe-area padding.
- `src/components/app/PushSettings.tsx` — strip time picker.
- `src/components/app/Announcements.tsx` — new.
- `src/routes/index.tsx` — render announcements; rewrite macros scoring branch.
- `src/routes/admin.tsx` — Daily-reminder section + Announcements section.
- `src/lib/push.functions.ts` — read settings, send dynamic title/body.
- New migration: `notification_settings`, `announcements`, RPCs, updated `list_due_reminders`.

No new secrets needed (VAPID already set). Existing pg_cron job keeps pinging `/api/public/hooks/send-reminders` every 15 min.