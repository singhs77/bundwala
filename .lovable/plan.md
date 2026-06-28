# Plan: Remove 3 more members + drop hot seat rule

## 1. Ban members (data migration via insert tool)
Set `is_banned = true` with ban message "you got too much bread you dont need this shit" for:
- Kazekage
- Trolla Singh
- Chic Mun

Also revoke their active sessions (delete from `member_sessions`).

## 2. Remove hot seat rule
- `src/routes/index.tsx`: remove the "Under hot seat" pill rendering and the `members_inactivity_overview` query used only for hot seat display. Keep the standings ranking intact.
- Keep the `enforce_inactivity_bans` call? **Remove it too** — hot seat was the warning before auto-ban; without the warning, auto-banning at 5 days is hidden punishment. Safer to stop calling `enforce_inactivity_bans()` from the client. (DB function stays in place, just unused.)

## 3. No schema changes needed
`is_banned`, `ban_message` already exist. Hot seat was UI-only.
