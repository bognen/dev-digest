# Mutation testing — eval scoring (SPEC-06 AC-57)

Passing tests prove the current code works; they don't prove the tests would notice a
change in logic. Stryker mutates the code (flips `<=` to `<`, `some` to `every`, drops a
`.trim()`…) and re-runs the tests: a mutant that **survives** is a logic change no test
catches. It's an eval for the tests — "check the checker", one level down.

- Target: `server/src/modules/eval/pipeline/scoring.ts` (the code that produces recall /
  precision / citation accuracy — a silent bug here would make every eval run lie).
- Tests: `server/test/eval-scoring.test.ts` only (`vitest.mutation.config.ts`).
- Run: `cd server && pnpm mutation:eval` (~20 s). HTML report: `server/reports/mutation/eval-scoring.html` (git-ignored).

## Before — 95.00 % (114 killed, 6 survived) · [log](./mutation-before.log)

| # | Mutant (survived) | Why the tests missed it |
|---|---|---|
| 1 | `p.trim()` → `p` in `normalizePath` | no path with surrounding whitespace |
| 2 | `.replace(/\\/g, '/')` → `.replace(/\\/g, "")` | no Windows-style path |
| 3 | `bHi = Math.max(bStart, bEnd)` → `Math.min` | reversed range tested only on the **first** range |
| 4 | errored case `matched: []` → `["Stryker was here"]` | test checked `unmatched`, not `matched` |
| 5 | `must_not_flag`: `kept.some(...)` → `kept.every(...)` | every test had exactly one finding |
| 6 | `traces_passed`: `=== 'pass'` → `!== 'pass'` | the only fixture had 1 pass + 1 error, so both counts were 1 |

## After — 100.00 % (120 killed, 0 survived) · [log](./mutation-after.log)

One test per survivor, in `describe('mutation killers (Stryker survivors)')` of
`server/test/eval-scoring.test.ts`. No equivalent mutants remained, so none had to be
documented as "can't be killed".

Survivor 6 is the instructive one: the metric had a test, but its fixture was
symmetric, so it could not tell "count passes" from "count non-passes".
