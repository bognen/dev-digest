---
name: workflow-retro
description: Workflow retrospective, run manually as /workflow-retro after a multi-agent workflow (/run-plan, orchestrator, spec-creator fan-out, review loops). Collects hard metrics from the session transcripts (tokens, agent count, spawn order, parallelism, durations, tool errors, duplicated file reads) and turns them into insights - what was hard or easy for each agent, what context was duplicated, what was missed - plus concrete prompt/plan/agent improvements. Read-only except one append-only row per run in docs/retros/ledger.md (trend across runs); writes a full report only on request.
disable-model-invocation: true
argument-hint: [session-id-or-transcript-path] [--save] [focus notes...]
metadata:
  type: workflow
  role: analyzer
  tags: retrospective, observability, multi-agent, tokens
---

# /workflow-retro — post-run retrospective

Read-only analysis of a finished (or just-finished) multi-agent run. You do **not**
edit code, plans, agents or skills; you report and recommend. Write the report in
the user's language (Ukrainian by default).

## 1. Collect hard numbers (never estimate them yourself)

```bash
node .claude/skills/workflow-retro/scripts/collect.mjs [session-id-prefix|path] [--json]
```

Default target = the most recently modified session of this project, i.e. the
current one. If `$ARGUMENTS` has a session id/path, pass it. The script reads
`~/.claude/projects/<project>/<session>.jsonl` and
`<session>/subagents/agent-*.jsonl` (+ `.meta.json`) and prints: totals, spawn
order with start/end/duration/turns/tokens/tool calls/errors, parallel overlap,
per-type rollup, files read by several agents, tool errors, biggest tool results.

Caveats to state in the report:
- `cacheRead` is re-counted on every turn (the context is re-read each time), so it
  dominates "total tokens". Report **cacheWrite + input + output** as the "new work"
  figure and cacheRead separately. Rough cost signal = output and cacheWrite.
- Hook-blocked / denied tool calls appear as tool errors; separate them from real failures.
- Subagents spawned by subagents are not tracked if the transcript has no `subagents/` dir.

## 2. Qualitative pass (only where the numbers point)

Don't read whole transcripts. Use the metrics to pick targets, then grep the relevant
`subagents/agent-<id>.jsonl` (tool_use/tool_result around errors, the final
`SubagentHandback` message, and the first user prompt):

- **Hard**: agents with most turns/tool errors/retries, big tool results, long wall time.
- **Easy**: few turns, no errors, report accepted unchanged.
- **Duplicated info**: files/greps read by 2+ agents; the same facts restated in
  several prompts (compare `promptChars`); handback reports repeating the plan.
- **Missed**: items in the plan/spec (MUST ids, edge cases) with no agent evidence;
  findings a later reviewer caught that an earlier agent should have; things an agent
  said it could not verify; questions agents had to ask the user mid-run.
- **Orchestration**: serial steps that could run in parallel; parallel agents
  touching the same files; fix loops (rounds needed, same finding recurring);
  agents run that added nothing (empty findings, tiny diff); wrong model tier
  (opus where sonnet suffices, or sonnet failing a hard step).

## 3. Report (≤ ~1 page, tables over prose)

1. **Overview** — session id, wall time, agent count by type, models, tokens
   (new-work vs cacheRead), fix rounds, verdict of the run in one line.
2. **Timeline** — spawn-order table from the script (mark parallel groups).
3. **Per-agent insights** — for each agent type: what was easy / hard / duplicated /
   missed, each with evidence (`agent-id`, file:line or tool name). No claim without evidence.
4. **Cross-cutting findings** — duplicated context, serial-vs-parallel, wasted agents,
   recurring errors (e.g. shell quoting, glob syntax) worth a hint in an agent prompt.
5. **Recommendations** — concrete and attributable to a file (`.claude/agents/x.md`,
   a plan template, `AGENTS.md`), ranked by saved tokens/time. Examples: "add the
   shared file list to the spawn prompt so researchers stop re-reading
   `run-executor.ts`", "cap researcher Bash calls at N", "merge steps 2+3".
6. **Open questions** — what the data cannot answer (no evidence either way).

Insights that are durable gotchas for a module belong in that module's `INSIGHTS.md`
via the `engineering-insights` skill — *suggest* it, don't write it here.

## 4. Saving

Default: print the report, then append the ledger row (below). With `--save`, also
write `docs/workflow-retros/<YYYY-MM-DD>-<short-topic>.md` (create the folder if
missing). Never commit.

### Ledger — `docs/retros/ledger.md`

One row per run, so the trend between runs is visible at a glance. This is the only
write the skill makes without `--save`.

- If the file is missing, create it with exactly this header (the table is the only
  content below the title):

  ```markdown
  # Workflow retro ledger

  One row per `/workflow-retro` run, newest last. Numbers come from `scripts/collect.mjs`.

  | Date | Workflow / topic | Session | Agents | Wall time | New-work tokens | Tool errors | Fix rounds | Verdict | Report |
  |---|---|---|---|---|---|---|---|---|---|
  ```
- Append **one** row at the end of the table (never edit or delete earlier rows;
  a corrected run gets a new row). Cells: ISO date; workflow and topic (e.g.
  `/run-plan pr-brief-polish`); first 8 chars of the session id; agent count; wall
  time (`12m`); new-work tokens (cacheWrite + input + output, e.g. `1.2M`); tool-error
  count; review/fix rounds; the one-line verdict from the report's Overview; link to
  the saved report, or `-` when `--save` was not used.
- A number the script did not report is `n/a`, never an estimate.
- After appending, compare with the previous row of the same workflow and add one
  line to the report: better / worse / flat on new-work tokens and tool errors.

## Possible extensions (not implemented — propose to the user when relevant)

- **Baseline history**: append one JSON line per run to `docs/workflow-retros/metrics.jsonl`
  and compare with the previous run of the same workflow (token/time regression).
- **Cost in USD** from a model price table (the script has the per-model token split).
- **Plan-vs-reality diff**: planned steps/waves vs agents actually run; scope drift via `git diff --stat`.
- **Finding yield**: findings per reviewer, how many were fixed vs dismissed (cost per accepted finding).
- **Prompt-size audit**: `promptChars` per spawn and share of the prompt that restates the plan.
- **Context-reuse score**: share of tool-result bytes that duplicate content another agent already fetched.
- **Idle/wait time**: gaps between an agent's end and the next start (orchestrator latency).
- **Human-in-the-loop count**: `AskUserQuestion` calls and permission denials per run.
- **Hook activity**: guard hooks that blocked writes, to tune hook rules or agent prompts.
