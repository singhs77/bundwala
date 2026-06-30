## Why people keep getting logged out

This app doesn't actually use OAuth — sign-in is the custom name + password flow that mints a `member_sessions` token stored in `localStorage` (`tracker.token`). Two things in the current setup combine to log people out sooner than expected:

1. **Sessions only get "touched" once per app load.** `src/routes/__root.tsx` calls `touch_session` exactly once on mount. If a user opens the app, then doesn't come back for 30+ days, the token expires and the next RPC throws `invalid_session`, which `handleRpcError` turns into `clearSession()` + "Session expired — please log back in." On mobile (the main use case), tabs get killed and reopened a lot, so this fires more than you'd expect.
2. **30-day window is short for a casual daily-log app**, and there is no "refresh on activity" — touching only happens on cold load, not on navigation or successful actions.

## Plan

### 1. Lengthen the session window — 1 year, sliding

Migration:
- Change `member_sessions.expires_at` default from `now() + interval '30 days'` to `now() + interval '1 year'`.
- Update `public.touch_session(_token)` to set `expires_at = now() + interval '1 year'` (instead of 30 days).
- Bulk-extend all currently-valid sessions: `UPDATE member_sessions SET expires_at = now() + interval '1 year' WHERE expires_at > now();` so existing logged-in users immediately get the longer window.

### 2. Touch the session more often (sliding refresh)

In `src/routes/__root.tsx`:
- Keep the on-mount `touch_session` call.
- Also call `touch_session` on `window` `focus` and `visibilitychange` → visible, throttled to at most once every 6 hours (tracked via a `localStorage` timestamp `tracker.lastTouch` so it survives tab reloads).
- This way any time the user opens the app (even just bringing the tab/PWA to the foreground), their 1-year clock resets.

### 3. Stop spurious sign-outs

In `src/lib/rpc.ts` `handleRpcError`:
- Only clear the session for `invalid_session` (already the case) — leave as-is, but double-check no other transient code paths trigger it. Network errors, RLS errors, etc. must not log the user out.
- No behavior change unless we spot another trigger; this is a safety review, not a rewrite.

### What stays the same

- Password reset, `member_set_password`, ban enforcement, and admin "revoke sessions" still wipe `member_sessions` rows — that's intentional and shouldn't change.
- Demo account behavior is unchanged.
- No UI changes; nothing visible to users except that they stop getting kicked out.

### Technical notes

- Files touched: one new SQL migration, `src/routes/__root.tsx`. No schema beyond column default + function body.
- `member_sessions` RLS / grants are unchanged; all access still goes through `SECURITY DEFINER` RPCs.
- Throttle key `tracker.lastTouch` is a millisecond epoch; cleared implicitly when the user signs out (we can also clear it in `clearSession`).