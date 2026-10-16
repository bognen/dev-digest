# Workflow retro ledger

One row per `/workflow-retro` run, newest last. Numbers come from `scripts/collect.mjs`.

| Date | Workflow / topic | Session | Agents | Wall time | New-work tokens | Tool errors | Fix rounds | Verdict | Report |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-14 | /run-plan (manual) multi-agent-review SPEC-07 | b9e1b1d5 | 7 | 106m | 1.21M | 15 | 0 | COMPLETE, green on first pass; 0/2 fix passes; implementers lost turns to Bash-reads and heredoc quoting | - |
| 2026-10-14 | /run-plan (manual) ci-agent-deployment SPEC-07 (run in parallel with the row above) | 366619c1 | 16 | 204m | 3.14M | 20 | 0 | COMPLETE, 4 waves, architecture review clean in round 1; lean run (no new tests, no security review); 87m of wall time waiting on one user question (nav placement) | [parallel vs sequential](2026-10-14-l07-parallel-vs-sequential.md) |

## Parallel vs sequential — L07 (2026-10-14)

Two rows above, run at the same time in two worktrees. "Sequential" is an estimate (the two measured runs one after the other), not a real run. Details: [2026-10-14-l07-parallel-vs-sequential.md](2026-10-14-l07-parallel-vs-sequential.md).

| | Parallel (actual) | Sequential (estimate) | Difference |
|---|---|---|---|
| Wall time (both features done) | 230m | 309m | −79m (−26%) |
| New-work tokens (incl. merge overhead) | 4.47M | 4.37M | +0.10M (+2.3%) |
| Merge/conflict overhead | ~53m, 0.10M | — | net time saving ≈ 26m (−8%) |

Verdict: parallel saved about a quarter of the wall time for about 2% more tokens. Most of that gain went on merge conflicts that came from having no up-front agreement on merge order and shared files (`nav.ts`, migration `0022`, the shared Postgres). That agreement is now in both L07 plans.
