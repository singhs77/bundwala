# Group Tracker App — Plan

A mobile-first PWA-style web app replacing your Google Sheet. Anyone with the link picks their name and starts logging. Lovable Cloud (Postgres + storage) powers persistence so the whole crew sees the same data in real time.

## Stack
- TanStack Start + Tailwind, dark athletic theme (#0a0a0a bg, green/red accents matching the sheet)
- Lovable Cloud for database + realtime updates
- No login — a "Who are you?" name picker on first visit, stored in localStorage (switchable anytime)

## Pages

1. **Home / Leaderboard** — Team standings (cards mirroring screenshot 1: team name, member rows, Gym/Macros/Deep Work/Sleep columns, totals, highlight leader). Tap a team to expand member breakdowns. Current-week by default with a week picker.
2. **Gym** — Daily check-in tile: Yes / No / Home Workout buttons for today. Below it, a 7-day strip showing your history (red/green pills like the sheet).
3. **Deep Work** — Big "+ Log session" button. Form: topic, time spent, start/finish (auto-filled with now), quick learnings, personal comments. Feed below shows everyone's recent sessions with comment thread.
4. **Sleep** — Time-picker for sleep + wake; hours-slept auto-calculated. Shows your sleep-schedule target (from screenshot 5 right table) and whether you hit it.
5. **Macros** — Daily entry (calories, protein, carbs, fat, sugar, water). Weekly average card per person.
6. **Admin** — Manage members, assign to teams, edit scoring rules (points per entry + weekly caps per category), mark "Meeting Day (Free Points)".

## Scoring engine
Configurable rules table; leaderboard totals recompute from raw logs + rules. Defaults seeded from your sheet (0.2/entry, weekly caps inferred per category). You can tweak anytime from Admin.

## Data model

```text
members      (id, name, avatar_url, team_id)
teams        (id, name, color, logo_url)
gym_logs     (id, member_id, date, status)            -- yes/no/home
deep_work    (id, member_id, date, topic, minutes,
              started_at, finished_at, learnings, personal_notes)
dw_comments  (id, deep_work_id, author_id, body)
sleep_logs   (id, member_id, date, sleep_time,
              wake_time, hours, free_day)
sleep_targets(member_id, target_sleep, target_wake)
macros_logs  (id, member_id, date, calories, protein,
              carbs, fat, sugar, water)
scoring_rules(category, points_per_entry, weekly_cap)
free_days    (date, label)
```

A SQL view `weekly_scores` aggregates per member/team per week applying caps.

## Seed data (from your screenshots)
- Teams: Straw boys, Team PDIO, Shaad Twins, OYE, Free Agent
- Members assigned to their teams
- Sleep targets per member from screenshot 5
- Default scoring: 0.2/entry, caps Gym 7, Deep Work 3, Sleep 5, Macros 3 per week (editable)

## Mobile UX
- Bottom tab bar: Home · Gym · Deep Work · Sleep · Macros
- Big tap targets, swipe-friendly cards, no horizontal scroll
- Add-to-Home-Screen meta tags so it feels like an app

## Build order
1. Enable Lovable Cloud, create schema, seed teams + members
2. Name picker + member context
3. Leaderboard with live scores view
4. Gym tracker
5. Deep Work log + comments
6. Sleep log with targets
7. Macros + weekly averages
8. Admin (scoring rules, members, free days)
9. PWA polish + bottom nav

Reply "go" to build, or tell me what to change (e.g. swap any tracker order, adjust the team list, different default caps).
