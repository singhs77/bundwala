## Plan: Derive "Last on app" from `activity_audit`

Replace the current `members.last_login_at`-based display on the member detail page with a value computed from the audit log.

### Logic
- **Last activity** = `MAX(activity_audit.created_at)` where `member_id = :memberId`.
- If a row exists → show formatted date/time (same locale format already used: e.g. "Jun 19, 2026, 9:41 PM").
- If no rows exist → compute audit-log age: `floor((now() - MIN(created_at across whole table)) / 1 day)` and show `"Not logged on in past N days"`.

### Implementation
In `src/routes/members.$memberId.tsx`, add two parallel queries to the existing `Promise.all`:
1. `supabase.from("activity_audit").select("created_at").eq("member_id", memberId).order("created_at", { desc: true }).limit(1).maybeSingle()` → member's last activity.
2. `supabase.from("activity_audit").select("created_at").order("created_at", { ascending: true }).limit(1).maybeSingle()` → oldest audit entry (for the fallback "past N days" copy).

Render in the existing "Last on app:" line:
- If last activity exists → format as today.
- Else → `Not logged on in past ${N} days` where `N = Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / 86400000)`. Fallback to `"Never"` if the audit table is empty.

Remove the now-unused `last_login_at` from the member `select()` (column stays in DB, just no longer read).

### Files touched
- `src/routes/members.$memberId.tsx` only. No migration, no RPC changes.

### Notes
- Audit log currently spans from 2026-06-13 (~9 days), so the fallback today would read "Not logged on in past 9 days".
- The nightly TESTER demo-reset writes audit rows for TESTER, so TESTER will always show recent activity — acceptable.
- RLS on `activity_audit` must allow public/anon SELECT for this to work from the client; if it doesn't, I'll wrap the two reads in a small SECURITY DEFINER RPC instead. I'll verify policies first when implementing.