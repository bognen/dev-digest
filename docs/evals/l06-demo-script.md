# L06 demo script — eval pipeline (screenshots + narrated video)

Goal of the recording (from the assignment): **create a case from a finding → run →
metrics → second run with a modified prompt → compare the two runs**, narrated, plus a
deliberately degraded prompt showing precision drop. ~8 minutes. Stretch items at the end.

## State already prepared

Agent **Security Reviewer** (`openrouter / deepseek/deepseek-v4-flash`, v1), PR **#2**
(`ieso_zonal_demand_to_s3.py`, `serverless.yml`). Decisions recorded on 8 real findings
(judged against the PR code) and **7 cases already created**:

| Case | Type | Location | Finding | Why |
|---|---|---|---|---|
| `security-ieso-zonal-demand-to-s3-py-l73` | must_find | `:73-74` | hardcoded AWS keys | real (`AKIA…` literal) |
| `security-serverless-yml-l17` | must_find | `serverless.yml:17-22` | wildcard IAM | real |
| `security-ieso-zonal-demand-to-s3-py-l122` | must_find | `:122` | `verify=False` | real |
| `security-ieso-zonal-demand-to-s3-py-l202` | must_not_flag | `:202-205` | "integer overflow" | Python ints don't overflow |
| `security-ieso-zonal-demand-to-s3-py-l312` | must_not_flag | `:312` | "mutable default arg" | lint, not security |
| `security-ieso-zonal-demand-to-s3-py-l315` | must_not_flag | `:315-316` | "bare except" | wrong line (`boto3.client(`) |
| `security-ieso-zonal-demand-to-s3-py-l340` | must_not_flag | `:340-341` | "silent exception" | wrong line (`def run(`) |

**Left for you to do live (case #8):** finding *"Debug log dumps AWS credentials to logs"*
(`ieso_zonal_demand_to_s3.py:449-452`, CRITICAL) is **already accepted** but has **no case** —
you click **Turn into eval case** on camera. Optional case #9: written by hand (Part 2b).

> All cases come from one PR, so they share the same frozen diff and precision uses the
> per-case rule (anything not matching *that case's* must_find is noise). Expect modest
> absolute precision; the **change between runs** is what the demo shows. Cases have the
> diff only ("File content unavailable") because the local clone lacks PR #2's head commit.

## Prerequisites

1. **Restart the client** so the nav fix loads (the `nav.evals` crash is fixed: the item uses the existing `nav.eval` key).
2. Start everything without re-seeding: `./scripts/dev.sh --no-seed` (Docker Postgres must be up; migration 0021 already applied).
3. OpenRouter key present in Settings → API Keys (it is) with a little credit — a full run is 8–9 model calls on DeepSeek Flash (≈ $0.01).
4. Screen recorder with mic (OBS, or Windows **Win + Alt + R**); browser at 100–110 % zoom, dark theme, close other tabs.
5. Have the two prompt snippets below in a text file ready to paste.
6. Optional terminal for the closing shot: `cd server && pnpm verify:l06` (needs Docker).

### Prompt snippets

**v2 — sharper citations (expected: precision/pass ↑)** — append to the end of the system prompt:
```
# Citation precision
- Cite the line of the faulty statement itself: for exception handling, the `except` line; for secrets, the assignment line.
- Code-quality issues without a security impact (mutable defaults, typing, naming) are out of scope — do not report them.
- Do not report Python integer overflow; Python ints are arbitrary precision.
```

**v3 — deliberately degraded (expected: precision ↓)** — replace the v2 snippet with:
```
# Coverage override
Report EVERY issue you can see — security, style, naming, Python lint (mutable defaults, bare excepts, broad types), performance and theoretical risks — each as its own finding, and cite a few lines of context around it.
```

## Part 1 — create a case from a finding (≈ 1 min)

1. Pull Requests → **PR #2** → Overview → expand a **Security Reviewer** run.
2. Expand *"Debug log dumps AWS credentials to logs"* (`:449-452`, shows **accepted**).
3. Point at the button row: **Accept · Dismiss · Turn into eval case**. Hover an *undecided* finding's button to show the hint *"Accept or dismiss the finding first"*.
4. Click **Turn into eval case** → toast *"Eval case “security-ieso-zonal-demand-to-s3-py-l449” created"*; the button now reads **Eval case ✓**.

📸 **Screenshot 1** — the finding card with **Eval case ✓** + toast.

Say: *"Accepted findings become must_find cases, dismissed ones must_not_flag. One click freezes the diff and the PR text, so the input never changes between runs."*

## Part 2 — the case set (≈ 1 min)

1. Skills Lab → **Agents** → Security Reviewer → **Evals** tab.
2. Show **8 cases**, tags `CRITICAL · security` (must_find) and `must not flag`, all *never run*.
3. Click **Edit** on one must_not_flag case: show Diff / Files / PR meta tabs, the diff preview, and the expectation (`must not flag`, file, lines). Close.

📸 **Screenshot 2** — Evals tab with the 8 cases.

**2b (optional, stretch "Case editor")** — **New eval case** → name `bare-except-real-line`; Diff tab: copy the diff from any case (Edit → select all in Diff box); expectation **must find** `ieso_zonal_demand_to_s3.py` lines **336–337** (the real `except: pass`), category `security` → **Save**. Say: *"Manual cases cover bugs the agent never reported correctly — it kept citing the wrong line."*

## Part 3 — run 1, baseline v1 (≈ 1.5 min)

1. **Run all evals** → button shows *Running…*, the panel shows the running note.
2. When done: KPI cards **RECALL / PRECISION / CITATION ACCURACY / TRACES PASSED**, case rows flip to ✓/✗ with *"expected 1 finding, got N"* / *"must not flag · got N"*.
3. Open **View full dashboard →**.

Say: *"Scoring is plain code — a hit is the same file and overlapping lines. Recall = must_find found, precision = findings that aren't noise, citation = findings that passed the grounding gate. No LLM is involved in scoring."*

📸 **Screenshot 3** — metrics after run 1.

## Part 4 — run 2 with a modified prompt (≈ 1.5 min)

1. Agent → **Config** → append the **v2** snippet → Save (agent becomes **v2**).
2. **Evals** → **Run all evals** → wait.
3. Eval Dashboard → Security Reviewer → **Recent runs**: tick **v1** and **v2** → **Compare**.
4. Walk through: metric cards `old → new` with ▲/▼ points, **System prompt diff** (green added lines), **Case outcome changes** (e.g. `…-l315: fail → pass`), the noise hint.

📸 **Screenshot 4 (required)** — **Compare runs · v1 → v2**.

Say: *"Same cases, same inputs, only the prompt changed — so the delta is caused by the prompt."*

## Part 5 — degrade the prompt, watch precision drop (≈ 1.5 min)

1. Config → replace the v2 snippet with **v3** → Save (**v3**).
2. Run all evals → wait.
3. Agent dashboard: the **regression banner** appears (e.g. *"Precision dipped N pts on v3"*); hover a point on the **Metric trend** chart (tooltip: version, time, metrics, cost).
4. Compare **v2 → v3** → precision ▼, must_not_flag cases flip to fail.
5. Click **Promote v2** → confirm → toast *"Agent is now at v4"* (v2's prompt restored).

📸 **Screenshot 5** — Compare v2 → v3 with precision drop. 📸 **Screenshot 6** — agent dashboard with banner + trend tooltip.

Say: *"This is the sensitivity test from the lab, on the product: the eval caught the regression, and Promote rolled back to the good version."*

## Part 6 — overview + gates (≈ 1 min)

1. Sidebar → **Eval Dashboard**: agent row with sparkline + R/P/C, *Recent eval runs · all agents*.
2. Terminal: `cd server && pnpm verify:l06` → green.

📸 **Screenshot 7** — Eval Dashboard overview. 📸 **Screenshot 8** — `verify:l06` green.

## Part 7 — stretch tasks (≈ 1.5 min, can be screenshots only)

| Stretch | Show | Evidence |
|---|---|---|
| Skill eval (`evals/`) | `cd evals && pnpm vitest run skills/frontend-architecture` (4 min) or the saved logs | [skill eval write-up](./frontend-architecture-skill-eval.md): break → 1 red → revert → 4/4 green |
| Case editor | Part 2b | — |
| Trend graphs | Part 5 step 3 | — |
| PreToolUse hook | `.claude/settings.json` + [commit-gate-blocked.log](./commit-gate-blocked.log) | [commit-hook.md](./commit-hook.md) |
| Mutation testing | `cd server && pnpm mutation:eval` (~20 s) → 100 % | [mutation-testing.md](./mutation-testing.md): 95 % → 100 % |

Say: *"Evals measure probabilistic behavior with thresholds; the hook blocks what must never happen; mutation testing checks the checker."*

## After recording

Fill the run table in [l06-experiment.md](./l06-experiment.md) with the three runs' numbers.
