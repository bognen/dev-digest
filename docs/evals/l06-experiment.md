# L06 experiment — prompt change vs eval metrics (SPEC-06 AC-58, AC-59)

Product-level counterpart of the lab's Experiment 3: the same agent, the same frozen case
set, different system prompts — does recall / precision move, and does a deliberately
worse prompt lose precision?

## Setup (manual — run in the app)

1. `cd server && pnpm db:migrate` (migration `0021_premium_moira_mactaggert.sql`), then `./scripts/dev.sh`.
2. On PR pages, accept and dismiss real findings of one agent (e.g. *Security Reviewer*),
   then click **Turn into eval case** on each — **≥ 8 cases, both `must_find` and
   `must_not_flag`** (optionally add a hand-written "clean" case with no expectations).
3. Agent → **Evals** tab → **Run all evals** → wait for the run to finish (v_A).
4. Edit the system prompt (Config tab) — a real improvement, e.g. tighter scope or an
   explicit "cite only changed lines" rule — and run again (v_B).
5. Degrade it deliberately, e.g. append
   *"Flag every style issue, naming nit and unused import you can find, even outside the
   changed lines."* — run again (v_C).
6. Eval Dashboard → agent → select two runs → **Compare** (screenshot v_A → v_B and v_B → v_C).

## Results

| Run | Version | Prompt change | Recall | Precision | Citation | Pass | Cost |
|---|---|---|---|---|---|---|---|
| A | v_ | baseline |  |  |  |  |  |
| B | v_ | improved |  |  |  |  |  |
| C | v_ | degraded |  |  |  |  |  |

Expected shape: the degraded prompt adds findings that match no `must_find` (and lands on
dismissed `must_not_flag` lines) → **precision drops**; findings outside the diff are
dropped by grounding → **citation accuracy drops**; recall may stay flat. A single case
flipping between two runs can be sampling noise (temperature 0 is set, but providers are
not fully deterministic) — read the trend chart before concluding.

Scoring made **zero LLM calls** in every run: the only model calls are one review per case
(verified by `test/eval.it.test.ts` — N cases → exactly N structured calls).
