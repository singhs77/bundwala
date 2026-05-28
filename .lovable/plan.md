# Fix: App stuck on "Loading…"

## What's broken

The `MemberGate` component shows "Loading…" until `useMembersQuery` resolves. That query (`SELECT id, name, avatar_url, team_id, has_password, teams(*) FROM members`) is run with the anon key and is now failing silently with a permission-denied error.

Root cause: the earlier security migration ran `REVOKE SELECT (password_hash, has_password) ON public.members FROM anon, authenticated`. Combined with the follow-up migration that dropped and re-added `has_password` as a regular column, all SELECT privileges on `public.members` for `anon` and `authenticated` were wiped — verified via `has_table_privilege('anon', 'public.members', 'SELECT') = false`. The RLS policy `USING (true)` is irrelevant when the role has no grant at all; PostgREST returns 403 and React Query stays in the loading state.

`password_hash` was already physically moved off `members` into the separate `member_credentials` table, so column-level revokes on `members` are no longer needed at all.

## Fix

Single migration:

```sql
GRANT SELECT ON public.members TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
```

This restores the public scoreboard read path. `password_hash` does not exist on this table anymore, and `member_credentials` remains locked down (no anon/authenticated grants), so the original security finding stays fixed.

## Verify

1. Reload the preview — the "Who are you?" picker should render member tiles instead of "Loading…".
2. `psql -c "SELECT has_table_privilege('anon', 'public.members', 'SELECT')"` returns `t`.
3. Re-run the security scan — `members_password_hash_public` should remain resolved (column no longer exists).
