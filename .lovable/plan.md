## Fix macros and gym scoring in `src/routes/index.tsx`

Both categories should award `5 / daysInMonth` per qualifying day, capped at 5 — so a fully logged month = 5.0 and a single day = a small fraction.

### Current bugs

- **Macros**: `pointsPerMacroLog = daysInMonth / 5` is inverted. For a 30-day month that's 6 pts per log, instantly capping at 5 on the first entry.
- **Gym**: hardcoded `gymCount * 0.25`, which only equals 5/daysInMonth for a 20-day month. Off for every other month length.

### Fix

In the `scores` `useMemo`, replace both with a single per-day rate:

```ts
const pointsPerDay = 5 / daysInMonth;
// gym
gym: Math.min(gymCount * pointsPerDay, 5),
// macros
macros: Math.min(macrosDates.size * pointsPerDay, 5),
```

Remove the now-unused `pointsPerMacroLog` line.

### Scope

- Only `src/routes/index.tsx` changes.
- May snapshot values stay as-is (they short-circuit before this code runs).
- Sleep and Deep Work scoring untouched.
- No DB / schema / RLS changes.
