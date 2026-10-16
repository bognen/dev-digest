# L07: parallel vs sequential (CI deployment ‖ Multi-Agent Review)

Added 2026-10-16 after the mentor review.

On 2026-10-14 two features were built at the same time, each in its own git worktree with its own
Claude Code session:

| Session | Branch / worktree | Feature |
|---|---|---|
| `366619c1` | `L07-ci-deployment` / `dev-digest-ci` | Deploy review agents to GitHub Actions |
| `b9e1b1d5` | `L07-multiagents` / `dev-digest-multiagents` | Multi-Agent Review |

The branches were merged on 2026-10-15 (`4b7d648`; it became `5b0d2b0` on 2026-10-16, when the runner changes were split out into `L07-agent-runner`).

**Where the numbers come from:**
- `.claude/skills/workflow-retro/scripts/collect.mjs` gives the subagent figures.
- The main-thread figures are cut to a time window from the same session `.jsonl`. Both sessions
  went on after the pipeline (demos, fixes), so whole-session totals would overstate the pipeline.
- **New-work tokens** = input + cacheWrite + output. cacheRead is shown separately (see the
  `workflow-retro` caveats).

## 1. Each pipeline on its own (measured)

Pipeline window: from the first prompt to the final `/run-plan` report.

| | Multi-Agent Review | CI deployment |
|---|---|---|
| Window (UTC, 2026-10-14) | 17:42:47 → 19:27:44 | 18:08:55 → 21:32:41 |
| Wall time | **105m** | **204m** (of which 87m waiting for the user, see §4) |
| Active time (wall minus waiting) | 105m | 117m |
| Subagents | 7 | 16 |
| New-work tokens: main thread | 0.29M | 0.47M |
| New-work tokens: subagents | 0.94M | 2.67M |
| **New-work tokens: total** | **1.23M** | **3.14M** |
| cacheRead (main + subagents) | 35.1M | 48.7M |
| Tool errors | 15 (ledger row) | 20 |

The ledger row for the multi-agent run says 1.21M. It was taken at the end of the run; the 1.23M
here uses the same window recomputed from the full log.

## 2. Parallel vs sequential

"Sequential" was **not run**. It is estimated as the two measured pipelines one after the other,
with no merge overhead.

| | Parallel (actual) | Sequential (estimate) | Difference |
|---|---|---|---|
| Wall time, first prompt → both features done | **230m** (17:42 → 21:32) | 105m + 204m = **309m** | **−79m (−26%)** |
| Same, minus the 87m user wait | 143m | 105m + 117m = 222m | −79m (−36%) |
| New-work tokens, both pipelines | 4.37M | 4.37M | 0 |
| Merge overhead, tokens (§3) | +0.10M | 0 | **+0.10M (+2.3%)** |
| **New-work tokens, total** | **4.47M** | **4.37M** | **+2.3%** |
| Merge overhead, wall time (§3) | ~53m | 0 | **net saving ≈ 26m (−8%)** |

**Conclusion.**
- Running in parallel saved about a quarter of the wall time and cost about 2% more tokens.
- Most of the time saved was lost again to fixing the conflicts it caused: about 53 minutes, most
  of it the user working through the merge by hand. That brings the net saving down to about 8%.
- Almost all of that overhead comes from things that would have been avoided by agreeing up front
  which branch merges first and which files are shared (`nav.ts`, the migration number, the shared
  DB). That agreement is now recorded in both plans ("Parallel work agreement").

## 3. Merge overhead (only exists because of the parallel run)

| When (UTC) | Session | What | New-work tokens | Wall time |
|---|---|---|---|---|
| 10-14 23:18 → 23:40 | `b9e1b1d5` | Both branches generated migration `0022` against one shared Postgres. Ours was skipped and the multi-run failed (`multi_agent_run_id` missing). Fixed via `_journal.json` `when` + `db:migrate`; user re-ran. | 36k | ~22m |
| 10-15 17:55 → 17:57 | `366619c1` | Writing the merge steps for the two worktrees | 17k | ~2m |
| 10-15 21:21 → 21:51 | `366619c1` | Merge conflicts (`nav.ts`, `hooks/index.ts`, migrations `0022` → CI renumbered to `0023`, `INSIGHTS.md`), moving development back into `dev-digest` | 47k | ~30m |
| **Total** | | | **~100k** | **~53m** |

## 4. Observations

- **The longest wait was itself a shared-file question.**
  - The CI session's 87-minute idle gap (19:49 → 21:16) was an `AskUserQuestion` before wave 4.
  - The question was whether "CI Runs" goes into GLOBAL next to Multi-Agent Review (as in the
    design) or stays in SKILLS LAB.
  - The other session had already decided that GLOBAL would hold the Multi-Agent Review item.
  - With an up-front agreement on who owns `nav.ts`, this question would not have needed asking.
- **There was one user for two sessions.**
  - Approvals happened in turn (multi-agent spec 18:11 → plan 18:46 → run-plan 18:47; CI spec
    18:28 → plan 18:43 → run-plan 19:20), so the two pipelines only overlapped from 18:08 to 19:27.
  - Parallel runs save time only while neither session is waiting on the user.
- **The CI run is heavier:** 16 agents, 2.6× the tokens. It spawned 12 implementers in 4 waves; the
  multi-agent run spawned 3. On the critical path, the shorter multi-agent run "came free".
- **The cost is not visible in either session alone.** The DB conflict showed up only at runtime,
  in the other session, 4 hours later.

## 5. Open questions (the data can't answer these)

- A real sequential run would not merge, but the second feature would have to be planned on top
  of the first (reading its changes and adjusting its plan). That cost is not measured, so the
  "sequential" tokens may be a little low.
- The user's own time outside the sessions (resolving conflicts in a terminal, switching between
  windows) is not in the logs.
- One pair of runs is not a trend. To get a real comparison, the next feature pair should be run
  one way and the same pair, or a similar one, the other way.
