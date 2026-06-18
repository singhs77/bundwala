## What's actually happening

The toast you saw is the raw error from the database: **`invalid_session`**, raised by `_member_from_token` inside `log_gym`. It's not about the gym entry itself — the entry was never even attempted. The function rejected the call at the very first step.

That happens when the `tracker.token` stored in your browser's localStorage no longer matches a row in `member_sessions` whose `expires_at` is in the future. Three things can cause that:

1. **The session expired.** Sessions are created with `expires_at = now() + 30 days`. If a member hasn't logged in for over a month (or used a different browser since), the token in localStorage is stale.
2. **The session row was deleted** (manual cleanup, password reset on that member, or someone logged out from another tab).
3. **The token in localStorage was wiped or corrupted** but the member id wasn't — so we send a token that doesn't exist.

Today the app doesn't handle any of these gracefully. It just shows `invalid_session` and you're stuck — every action (gym, sleep, deep work, macros) will keep failing because they all go through the same token check.

I verified the gym RPC itself is healthy: calling `log_gym` with a valid Baby GL token for today's date worked fine and inserted the row.

## Fix

### 1. Auto-recover from expired sessions (the real fix)

Add a tiny wrapper around `supabase.rpc(...)` calls that:
- Detects `invalid_session` in the error message.
- Clears the local session (`clearSession()` in `src/lib/me.ts`).
- Shows a friendly toast: **"Your session expired. Please pick your member and log back in."**
- Opens the member picker so the user can re-enter their password in one tap.

I'll apply it to every page that calls a token-based RPC: `gym.tsx`, `sleep.tsx`, `deep-work.tsx`, `macros.tsx`, plus the push-subscription updates and the comment/deep-work bonus calls. One helper, used everywhere.

### 2. Make the error message friendly even before the wrapper kicks in

Replace `toast.error(e.message)` in the gym/sleep/deep-work/macros mutations with a small `formatRpcError()` that maps the known raised exceptions to human text:
- `invalid_session` → "Session expired — please log back in."
- `bad_date` → "That date is out of range."
- `bad_status` / `bad_minutes` / `bad_value` / `bad_water` / `bad_hours` / `bad_goal` → "Invalid value — please check the field."
- `topic_too_long` / `text_too_long` → "That entry is too long."
- anything else → the raw message (so we never silently swallow a real bug).

### 3. Keep sessions alive while you're using the app

Right now `expires_at` is set once at login and never bumped. I'll add a small DB function `touch_session(_token uuid)` that extends `expires_at` to `now() + 30 days` if the token is still valid, and call it once on app load from `__root.tsx`. That way an active user never hits the 30-day cliff. If the token is already invalid, `touch_session` is a no-op and the existing recovery flow above handles it.

## Out of scope

- I'm not changing the session TTL (still 30 days) or the password flow.
- I'm not touching the gym table, the `log_gym` function, or RLS — they're working correctly.
- The duplicate unique constraint on `gym_logs (member_id, date)` is harmless (both indexes match the `ON CONFLICT` clause), so I'll leave it alone unless you want it cleaned up.

## Technical summary

- New file: `src/lib/rpc.ts` exporting `callRpc(fn, args)` and `formatRpcError(err)`. `callRpc` invokes `supabase.rpc`, and on `invalid_session` calls `clearSession()` + toasts + dispatches a `tracker:session-expired` event.
- `src/components/app/MemberPicker.tsx`: listen for `tracker:session-expired` and auto-open the picker.
- `src/routes/gym.tsx`, `sleep.tsx`, `deep-work.tsx`, `macros.tsx`, and `src/components/app/PushSettings.tsx`: route token-based RPC calls through `callRpc`, and use `formatRpcError` in `onError`.
- Migration: add `public.touch_session(_token uuid)` (SECURITY DEFINER) that updates `member_sessions.expires_at` to `now() + interval '30 days'` where `token = _token AND expires_at > now()`.
- `src/routes/__root.tsx`: on mount, if a session exists, fire-and-forget `supabase.rpc('touch_session', { _token })`.
