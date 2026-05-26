Add a **Change admin password** section to the bottom of `src/routes/admin.tsx`.

Three password inputs (current, new, confirm new) and an "Update password" button. On submit, calls the existing `admin_set_password(_current, _new)` RPC. Shows a toast on success/failure and clears the fields.

No DB changes — the RPC already exists and validates the current password + enforces a 4-character minimum.

That way Baby Gl (or anyone with the current password `bundwala,`) can change it to whatever they want from the admin page.