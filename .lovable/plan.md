
## What's broken

The password-reset migration I shipped last turn has two bugs:

1. Both new admin RPCs call `public._verify_admin(_password)`, but that function doesn't exist in this project. The real admin verifier is `admin_verify(_password)` (returns boolean). Result: `admin_list_password_resets` throws as soon as the admin password is entered, so the section stays empty.
2. `admin_clear_member_password` clears `members.password_hash`, but in this schema passwords live in a separate `member_credentials` table, and the "has a password" flag is `members.has_password`. Clearing the wrong column does nothing — the user still can't sign in.

I'll also save your "always plan first" rule so future turns start with a plan.

## Fix

One migration that replaces both functions:

- `admin_list_password_resets(_password)` — gate with `IF NOT admin_verify(_password) THEN RAISE EXCEPTION 'wrong_password'`. Same return shape, so the existing admin UI keeps working.
- `admin_clear_member_password(_password, _member_id)` — same admin gate, then:
  - `DELETE FROM member_credentials WHERE member_id = _member_id`
  - `UPDATE members SET has_password = false WHERE id = _member_id`
  - `DELETE FROM member_sessions WHERE member_id = _member_id` (force re-login)
  - mark the open `password_reset_requests` row resolved

After this, on next login the member sees the "Set a password" flow (because `has_password = false` and `member_credentials` is empty), which is exactly the original intent.

## No frontend changes

The admin section and the "Forgot password?" button on the login screen already call these RPCs with the right shape — they just need the server side to actually work.

## Verification

After the migration:
1. Go to `/admin`, enter the admin password — the "Password reset requests" section should load (empty if no requests).
2. From the login screen on another profile, click "Forgot password?" — request appears in admin.
3. Click "Clear password" — that member's row drops to the "Set a password" flow on next login.
