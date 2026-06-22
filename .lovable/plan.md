## Plan: Add "Last Logged On" to Member Detail Page

### Goal
Show when a member last logged into the app on their detail page (accessed by clicking a name in Standings).

### Changes

#### 1. Database — add `last_login_at` to `members` table
- Add `last_login_at timestamptz` column to `public.members` (nullable, no default).
- Update the three login RPCs that create sessions to also set `last_login_at = now()`:
  - `member_set_password`
  - `member_verify_password`
  - `demo_login`
- Update column-level grants so `last_login_at` is readable by public/anon.

#### 2. Frontend — display on member detail page (`members.$memberId.tsx`)
- Include `last_login_at` in the member `select()` query.
- Add a small "Last logged on" row under the member name / team in the header card.
- Format: locale-aware date + time (e.g. "Jun 19, 2025, 9:41 PM"). Show "Never" if null.

### No other pages affected
Standings page itself stays unchanged; only the detail page gets the new line.

### Files to edit
- Supabase migration (new)
- `src/routes/members.$memberId.tsx`