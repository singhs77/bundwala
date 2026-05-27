## Problem

In the Announcements section of `/admin`, the trash icon next to each announcement is wired to a mutation that uses the password from the "Admin password" input in that same section. If that field is empty, the button is disabled (so clicking does nothing). If something else is wrong, errors are silently swallowed.

## Fix

Update the delete handler in `AnnouncementsSection` (`src/routes/admin.tsx`) so deleting works reliably:

1. Remove the `disabled={!password}` gate on the trash button. Instead, on click:
   - If the password field is empty, use `window.prompt("Admin password")` to ask for it inline.
   - If still empty/cancelled, show a toast ("Password required") and stop.
2. Wrap the deletion in a confirm step (`window.confirm("Delete this announcement?")`) so accidental taps on mobile don't nuke posts.
3. Pass the resolved password into the existing `admin_delete_announcement` RPC call.
4. Keep the existing error toast on failure so a wrong password surfaces clearly instead of failing silently.

No DB / RPC changes — `admin_delete_announcement` already exists and validates the password.
