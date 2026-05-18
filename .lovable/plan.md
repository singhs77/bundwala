## Goal
Update the monthly scoring math on the Standings page for **gym** and **macros**. No schema changes, no other categories touched.

## New rules

**Gym** — linear 0.25 pts per qualifying day, capped at 5 pts/month
- Qualifying day = `gym_logs.status` is `yes` or `home` (unchanged)
- 20 days → 5 pts. Below 20 = `days × 0.25`.

**Macros** — 1.25 pts per fully-logged week (Sat→Fri), capped at 5 pts/month
- A week earns 1.25 only if there are macros entries with non-null `calories` on **all 7 days** of that Sat→Fri week.
- Only weeks whose Saturday falls within the displayed month count (so partial overlap weeks at month edges don't earn — keeps it deterministic). I'll surface this in code comments; if you'd rather count weeks that *overlap* the month, say so and I'll switch.

## Implementation (single file)

Edit `src/routes/index.tsx` `scores` memo:

```ts
// Gym: ignore scoring_rules cap/points, use fixed formula
const gymDays = data.gym.filter(g => g.member_id === m.id && (g.status === "yes" || g.status === "home")).length;
const gymPts = Math.min(gymDays * 0.25, 5);

// Macros: build Sat→Fri weeks contained in the month, award 1.25 if all 7 days logged
const macrosByDate = new Set(
  data.macros.filter(x => x.member_id === m.id && x.calories !== null).map(x => x.date)
);
let macrosPts = 0;
for (const sat of saturdaysInMonth(anchor)) {
  const weekDates = Array.from({length:7}, (_,i) => toISODate(addDays(sat, i)));
  if (weekDates.every(d => macrosByDate.has(d))) macrosPts += 1.25;
}
macrosPts = Math.min(macrosPts, 5);
```

Helpers added to `src/lib/week.ts`:
- `addDays(d, n)`
- `saturdaysInMonth(anchor)` — returns each Saturday whose date is in the month

Baselines (`baseline_scores`) continue to add on top, same as today.
Sleep + deep_work logic untouched.

## What you'll see
For the screenshot you sent (gym days per person): Trolla 11→2.75, Arneet 8→2.0, Saju 10→2.5, Kazekage 5→1.25, Zoro 8→2.0, Dr GL 11→2.75, Chic Boy GL 11→2.75, Twin GL 9→2.25, Dillski 7→1.75, Chic Mun 9→2.25, Baby GL 10→2.5, Shaad Paji 9→2.25, Milan 9→2.25.

For macros this week (05/16–05/22 Sat–Fri): a player earns 1.25 only after logging calories every day Sat through Fri.

## Out of scope
- No DB migration. `scoring_rules` rows for gym/macros become unused but stay (harmless; admin page still edits them but they won't affect standings).
- No change to sleep, deep work, free days, or baselines.