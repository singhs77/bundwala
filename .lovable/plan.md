## Goal

Resolve the `members_password_hash_public` finding. The previous fix used column-level GRANTs to hide `password_hash` and `has_password` from `anon`/`authenticated`, which works in practice — but the scanner still flags the table because the row-level policy is `USING (true)` and the sensitive column lives on the row. The robust fix is to physically move the secret out of `members`.

## Approach

Split credentials into a new private table that has **no GRANTs to anon/authenticated** and **no RLS policies**. Only `SECURITY DEFINER` RPCs (running as `postgres`) will touch it.

### Migration

1. Create `public.member_credentials`:
   - `member_id uuid primary key references members(id) on delete cascade`
   - `password_hash text`
   - `updated_at timestamptz default now()`
2. Copy existing hashes: `INSERT ... SELECT id, password_hash FROM members WHERE password_hash IS NOT NULL`.
3. `GRANT ALL ON public.member_credentials TO service_role;` — no grants to anon/authenticated. RLS enabled, no policies.
4. Recreate a `has_password` computed view OR keep `has_password` as a generated column on `members` derived from a join — simplest: add a generated boolean is not possible across tables, so instead:
   - Drop `members.password_hash` and `members.has_password` columns.
   - Expose `has_password` via the existing public read on `members` by adding a new boolean column `has_password` maintained by the RPCs (already present today — keep it, just stop storing the hash here). The scanner's complaint is about the hash, not the boolean flag.
5. Update the four affected `SECURITY DEFINER` functions to read/write `member_credentials` instead of `members.password_hash`:
   - `member_verify_password`
   - `member_set_password`
   - (no other functions touch the hash)
   Each function continues to update `members.has_password` for the public read path.

### App code

No client changes required — all password flows already go through `member_verify_password` / `member_set_password` RPCs. The `MemberPicker` reads `has_password` from `members`, which still works.

### Verification

- Confirm `SELECT password_hash FROM members` fails (column gone).
- Confirm login + set-password flows still work in the preview.
- Re-run the security scan and mark the finding fixed.

## Out of scope

The other three findings currently shown (admin page direct writes, `delete_push_subscription_by_endpoint` unauth, `send-reminders` unauth) — happy to tackle those next in a separate pass if you want.
