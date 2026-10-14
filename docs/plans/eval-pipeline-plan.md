# Development Plan: Eval pipeline (SPEC-06)
Spec: specs/eval-pipeline.md
Status: approved

## In plain words — what we are building and why

Today, when you change an agent's prompt, you only find out whether it got better
or worse on the next real PR. This plan adds a **regression test bench** for agents:

1. **Collect test cases from your own decisions.** On a finding you already accepted
   or dismissed, a new button "Turn into eval case" saves a small frozen copy of the
   PR (the diff of that file, the file itself, PR title/body) plus the expectation:
   - accepted → "the agent **must find** something at `file:lines`";
   - dismissed → "the agent **must not flag** `file:lines`".
   You can also write cases by hand (paste a diff, pick file + lines).
2. **Run the agent on all cases.** One click re-reviews every saved snippet with the
   agent's *current* prompt/model/skills. Nothing else from the live repo is mixed
   in (no repo map, no project docs, no intent), so two runs differ only because
   the agent changed — that is what makes them comparable.
3. **Score with plain code, no AI.** A finding "hits" an expectation when the file is
   the same and the line ranges overlap. From that:
   - **recall** = how many `must_find` targets were found;
   - **precision** = how many findings were real hits (everything else is noise,
     including anything on a `must_not_flag` spot);
   - **citation accuracy** = how many findings pointed at real diff lines (the
     existing grounding gate decides).
4. **See and compare.** An "Evals" tab on each agent (and on each skill) lists the
   cases, the latest metrics, a trend chart and run history. A new sidebar page
   "Eval Dashboard" shows all agents. Pick two runs → "Compare" shows the metric
   deltas and the system-prompt diff, and "Promote" restores the better version.
5. **Developer-side guards** (not product UI): harness evals for the L02
   `frontend-architecture` skill in `evals/`, a Claude Code hook that blocks
   `git commit` while tests fail, and mutation testing of the scoring code.

Where things land: a new server module `server/src/modules/eval/`, new DB columns/
table + one generated migration, new shared contracts (mirrored to the client),
shared client components under `client/src/components/evals/`, a dashboard route
`/evals`, and small edits to FindingCard, Agent/Skill editors and the sidebar.

Nothing here changes how normal PR reviews run (one optional engine input is added;
when it is absent the request is byte-identical).

---

### Requirements review
**Source reviewed:** `specs/eval-pipeline.md` (SPEC-06, approved by the user on
2026-10-13) and the code it cites. Findings that shape the plan:

- **Clone ≠ PR head.** The local checkout tracks the default branch (server
  `INSIGHTS.md` 2026-10-09), so "head content of the finding's file" (AC-3) must be
  read with `GitClient.readFileAtRef(repo, pull.headSha, path)`
  (`server/src/vendor/shared/adapters.ts:238`, implemented in
  `adapters/git/simple-git.ts:143`), not from the working tree. The diff comes from
  the existing `loadDiff` (`reviews/diff-loader.ts:12`), which already falls back to
  `pr_files` patches.
- **History must survive case deletion (AC-11)**, but `eval_runs.case_id` is
  `ON DELETE CASCADE` (`db/schema/eval.ts:24-26`). The plan makes it nullable with
  `ON DELETE SET NULL` and stores a case-name + expectation snapshot on each result.
- **No run-level table exists.** `eval_runs` is one row per case. Comparing runs,
  history, the trend chart and Promote all need a parent "suite run" row holding the
  agent version + config snapshot + aggregate metrics → new table `eval_suite_runs`.
- **Architecture lint.** `.dependency-cruiser.cjs:24-26` only treats
  `service|run-executor|helpers|status|constants|findings|diff-loader` and
  `pipeline/` as inner-ring files. Pure scoring/snippet code therefore goes under
  `modules/eval/pipeline/` so `pnpm arch:check` covers it.
- **Engine input for attached files.** `ReviewInput.projectDocs`
  (`reviewer-core/src/review/run.ts:62-67`) already renders path-labelled untrusted
  documents; case files use it (AC-61). Grounding uses only `diff` → files can never
  produce a grounded hit outside the diff.
- **Temperature (AC-65).** Adapters default structured calls to 0
  (`adapters/llm/openai.ts:37`, `anthropic.ts:108`, `reviewer-core/src/llm/openrouter.ts:93`),
  but the engine never sets it explicitly, so it cannot be asserted. Step 3 adds an
  optional `temperature` to `ReviewInput`; absent → request unchanged.
- **Promote (AC-34)** reuses `AgentsService.update` + `setSkills`
  (`agents/service.ts:130,187`), which already bump `version` and write
  `agent_versions`.
- **UI kit** already has `LineChart`, `Sparkline`, `MetricCard`, `Modal`,
  `Checkbox`, `Tabs`, `ConfirmDialog` (`client/src/vendor/ui/charts|kit`), and a
  diff renderer `components/diff-viewer/DiffViewer` that takes `PrFile[]`.
- **Nav test.** `client/src/vendor/ui/nav.test.ts` pins the SKILLS LAB items; it
  must be updated together with `nav.ts` (the design puts Eval Dashboard in SKILLS LAB).
- **No `.claude/settings.json` exists** on this branch. The template's examples are a
  `type: "prompt"` PreToolUse hook on `git push` (`upstream/Lesson-06-lab-finish:.claude/settings.json`)
  and command hooks in agent frontmatter (`.claude/hooks/*-guard.mjs`); ours follows
  the command-hook pattern.

**Recommended spec improvements** (non-blocking, adopted in the plan as assumptions):
1. AC-12 "background" run + server restart: a `running` row would stay stuck and
   block AC-15 forever. **Adopted:** a `running` suite run older than 30 min is
   treated as stale (marked `failed`, "Interrupted") before the 409 check.
2. AC-6 "same finding" — one case per (owner, source finding). **Adopted:** unique
   partial index on `(owner_kind, owner_id, source_finding_id)`.
3. AC-29 — "older on the left" is decided by `started_at`, regardless of selection order.

**Execution mode:** single-agent (the user asked me to write the plan directly; no
subagents spawned).

### Scope
All of SPEC-06: AC-1 … AC-65, NFR-1 … NFR-7, US-1 … US-13.
Out of scope (spec non-goals): LLM judging of finding text, re-sync on decision
change, CI thresholds, CI-runner/mcp-server exposure, statistical repeats,
multi-agent composed review evals, the "Advanced JSON" expectation view.

### Modules affected
- **reviewer-core** — optional `temperature` on `ReviewInput` (one field, threaded).
- **server** — new `modules/eval/` (routes, service, repository, run-executor,
  pipeline/*), schema + migration, contracts, module registry, `package.json`
  scripts (`verify:l06`, `mutation:eval`), Stryker config.
- **client** — contracts mirror, `lib/hooks/eval.ts`, `components/evals/*`,
  FindingCard, AgentEditor, SkillEditor, `/evals` pages, `vendor/ui/nav.ts`,
  `messages/en/eval.json`.
- **evals/** — `skills/frontend-architecture/*`.
- **repo root** — `.claude/settings.json`, `.claude/hooks/commit-test-gate.mjs`,
  docs.
- **e2e / mcp-server** — not touched.

### Architectural constraints
- **Root `AGENTS.md`:** vendored contracts mirrored by hand into both
  `server/src/vendor/shared` and `client/src/vendor/shared`; migrations never run on
  boot (`cd server && pnpm db:migrate`); never touch `server/clones/**`.
- **`server/AGENTS.md`:** routes → service → ports; only repositories touch
  Drizzle; services take explicit deps, not the `Container`; `pnpm arch:check` with a
  baseline that may only shrink; integration tests end in `*.it.test.ts`; migrations
  are generated, never hand-edited.
- **`server/INSIGHTS.md`:** export a new schema table from the `db/schema.ts` barrel
  *before* `pnpm db:generate` (else drizzle generates a DROP); pure logic in
  `helpers.ts`/`pipeline/`; contract mirroring can flip CRLF/LF → run
  `scripts/check-vendor-shared-sync.sh`; post-`done` side effects need `vi.waitFor`
  in integration tests; checkout tracks the default branch.
- **`reviewer-core/AGENTS.md`:** zero I/O; every finding list leaves through
  `groundFindings()`; absent optional input ⇒ byte-identical prompt/request.
- **`client/AGENTS.md`/`INSIGHTS.md`:** UI only from the `@devdigest/ui` barrel; data
  only via `lib/hooks/*`; `vendor/ui/**` edits deliberate (nav only);
  `@testing-library/user-event` not installed (use `fireEvent`); `Modal` is not a
  portal; `Checkbox`/`Toggle` have no `disabled` prop.
- **`TESTING.md`:** mock LLM/GitHub/git via `adapters/mocks.ts`
  (`MockLLMProvider`); one real integration per data-backed workflow.
- **Skills routed per file** (from `pr-self-review`): `onion-architecture`,
  `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod`,
  `security` (server); `frontend-architecture`, `react-best-practices`,
  `next-best-practices`, `react-testing-library`, `dataviz` (client charts).

### Data model (decided here, implemented in step 2)
- `eval_cases` (existing) **+** `source_finding_id uuid null`, `created_at`,
  `updated_at`; unique partial index `(owner_kind, owner_id, source_finding_id)
  WHERE source_finding_id IS NOT NULL`. JSON columns get typed shapes:
  - `expected_output` → `{ expectations: EvalExpectation[] }`, each
    `{ id, type: 'must_find'|'must_not_flag', file, start_line, end_line,
    severity?, category?, title? }` (0–10 items; 0 = "clean" case);
  - `input_files` → `{ path, content }[]` (0–10, ≤ 100 KB each);
  - `input_meta` → `{ pr_title, pr_body, source?: { finding_id, review_id, pr_id,
    repo, pr_number } }`.
- **New** `eval_suite_runs`: `id, workspace_id, owner_kind, owner_id,
  host_agent_id, scope ('full'|'case'), status
  ('running'|'done'|'partial'|'failed'), agent_version, config_snapshot jsonb
  (AgentVersionConfig + skill versions), case_ids jsonb, recall, precision,
  citation_accuracy, vacuous jsonb, traces_passed, traces_total, cost_usd,
  duration_ms, error, started_at, finished_at`; index `(owner_kind, owner_id,
  started_at desc)`.
- `eval_runs` (existing, = per-case result) **+** `suite_run_id` (FK → suite runs,
  cascade), `status` ('pass'|'fail'|'error'), `case_name`, `expected_snapshot`
  jsonb, `error`; `case_id` becomes nullable, FK `ON DELETE SET NULL`.
  `actual_output` holds `{ kept: Finding[], dropped: {finding, reason}[],
  matched: string[], unmatched: string[] }`.

### Steps

**Wave 1 — foundations (disjoint files)**

1. [wave 1] Contracts — `server/src/vendor/shared/contracts/eval-ci.ts`, mirrored
   byte-identically to `client/src/vendor/shared/contracts/eval-ci.ts`.
   - Add (keep existing exports unchanged): `EvalExpectationType`,
     `EvalExpectation`, `EvalExpectedOutput`, `EvalCaseFile`, `EvalCaseMeta`,
     `EvalCaseDetail` (EvalCase + typed fields + `source_finding_id` + `last_result`),
     `EvalCaseUpsert` (manual create/update body with the AC-44–46 limits),
     `CreateCaseFromFindingResult` (`{ case, created: boolean, note: string|null }`),
     `EvalSuiteRunStatus`, `EvalSuiteRun`, `EvalCaseResult`, `EvalSuiteRunDetail`,
     `StartEvalRunBody` (`{ host_agent_id? }`), `EvalAgentSummary` (dashboard row),
     `EvalOverview` (`{ agents, recent_runs }`), `EvalOwnerDashboard` (KPI + delta +
     trend + history + alert), `PromoteResult` (`{ agent, skipped_skills }`),
     `RunAllResult` (`{ started[], skipped[{agent_id, reason}] }`). Trend points
     extend `EvalTrendPoint` with `run_id`, `agent_version`.
   - Implements: contract side of AC-1–AC-65; NFR-6.
   - Governed by: `zod`. Owner: implementer. Then run `scripts/check-vendor-shared-sync.sh`.

2. [wave 1] Schema + migration — `server/src/db/schema/eval.ts`,
   `server/src/db/schema.ts` (barrel export of `evalSuiteRuns` **before**
   generating), `server/src/db/migrations/<generated>` via `pnpm db:generate`.
   - The data model above. Never hand-edit the generated SQL; review it for a
     stray DROP.
   - Implements: AC-6 (unique index), AC-11, AC-14, AC-27, AC-19 (`scope`).
   - Governed by: `drizzle-orm-patterns`, `postgresql-table-design`. Owner: implementer.

3. [wave 1] Engine temperature — `reviewer-core/src/review/run.ts` (+ the call that
   builds the structured request), `reviewer-core/test/*`.
   - Optional `ReviewInput.temperature?: number` forwarded to every chunk's LLM
     request only when defined.
   - Implements: AC-65 (engine side). Trivial test: request without `temperature`
     is deep-equal to today's.
   - Governed by: `typescript-expert`; reviewer-core zero-I/O contract. Owner: implementer.

4. [wave 1] Pure pipeline — `server/src/modules/eval/pipeline/scoring.ts`,
   `pipeline/snippet.ts`, `pipeline/validate.ts`, `pipeline/naming.ts`,
   `server/src/modules/eval/constants.ts`.
   - `scoring.ts`: `normalizePath`, `rangesOverlap`, `matchCase(case, kept)`,
     `scoreRun(caseOutcomes)` → recall / precision / citation / vacuous flags /
     traces passed, per AC-20–AC-25 (vacuous ⇒ 1.0 + flag; errored case ⇒ its
     `must_find` count as unmatched, no findings counted). No I/O, no LLM import.
   - `snippet.ts`: extract the finding file's section from a raw unified diff; if
     > 400 diff lines keep only hunks overlapping the range (AC-4).
   - `validate.ts`: parsable hunk check, file-in-diff + range-intersects-new-side
     check, size/count limits (AC-44–AC-46) → field-level errors.
   - `naming.ts`: `<category>-<basename>-l<line>` kebab, ≤ 60, `-2…` suffix (AC-7).
   - `constants.ts`: limits (400 lines, 200 KB diff, 100 KB file, 10 files, 10
     expectations), stale-run timeout 30 min, dashboard limits (20 recent, 10 spark).
   - Implements: AC-4, AC-7, AC-20–AC-25, AC-44–AC-46 (logic); NFR-1, NFR-2.
   - Governed by: `onion-architecture` (inner ring), `typescript-expert`. Owner: implementer.

5. [wave 1] Unit tests for step 4 — `server/test/eval-scoring.test.ts`,
   `eval-snippet.test.ts`, `eval-validate.test.ts`, `eval-naming.test.ts`.
   - Table tests named after the spec's Verify hints (overlap edges, prefix
     stripping, AC-22's 1/3 example, vacuous metrics, case-pass shapes, 100×
     determinism, 600-line snippet, name clash).
   - Owner: test-writer (implementer may add the trivial ones while building step 4).

**Wave 2 — server module (depends on wave 1)**

6. [wave 2] Repository — `server/src/modules/eval/repository.ts`.
   - CRUD for cases (by owner, by source finding, sources list), suite runs
     (create/finish/list by owner + period/latest per owner/recent across
     workspace/stale sweep/running check), case results (insert, by suite run, last
     per case), all workspace-scoped. Reads the finding context through a narrow
     query (finding → review → pull → repo, agent id).
   - Governed by: `drizzle-orm-patterns`, `onion-architecture`. Owner: implementer.

7. [wave 2] Run executor — `server/src/modules/eval/run-executor.ts`.
   - Ports in (explicit deps): `llm(provider)`, `agentsRepo.linkedSkills`, skill
     version lookup, eval repository, logger. For each case: `parseUnifiedDiff(
     input_diff)` → `reviewPullRequest({ systemPrompt, model, diff, llm, strategy,
     skills, projectDocs: input_files, prDescription: pr_body, task:
     "Review PR: <title>", temperature: 0 })` — **no** repo-intel, callers,
     project-context resolver, intent (AC-13, AC-61, AC-65). Score with
     `pipeline/scoring`, persist each case result, then the aggregates. Per-case
     try/catch → `error` result (AC-16); all errored → `failed` (AC-17). Skill
     evals: host agent's prompt/model/strategy, only the skill under test (AC-52).
   - Structured logs per run and per case (NFR-5). Never logs diff/file content.
   - Implements: AC-12–AC-19, AC-26, AC-27, AC-52, AC-61, AC-65; NFR-1, NFR-5.
   - Governed by: `onion-architecture`, `security`. Owner: implementer.

8. [wave 2] Service — `server/src/modules/eval/service.ts`, `helpers.ts`.
   - `createFromFinding` (AC-1–AC-8, AC-62, AC-64: decision check → 409, existing
     → return, `loadDiff` → 503 on failure, snippet, `readFileAtRef(headSha)` →
     note on failure/oversize, name), case CRUD with `validate` (AC-43–AC-47),
     `startRun` (provider key check → 422, zero cases → 422, stale sweep, running →
     409, snapshot config + skill versions, fire-and-forget executor → 202),
     single-case run (`scope: 'case'`), skill run with host resolution (AC-52,
     AC-63), history/dashboard/overview (deltas, sparkline, trend in period,
     `alertText` in `helpers.ts` for AC-41), `promote` (AC-34/35 via
     `AgentsService.update` + `setSkills`), `runAll` (AC-40).
   - Implements: the service side of US-1–US-10.
   - Governed by: `onion-architecture`, `security`. Owner: implementer.

9. [wave 2] Routes + registry — `server/src/modules/eval/routes.ts`,
   `server/src/modules/index.ts`.
   - `POST /findings/:id/eval-case` · `GET /eval/cases?owner_kind&owner_id` ·
     `GET /eval/cases/sources` · `POST /eval/cases` · `GET|PUT|DELETE
     /eval/cases/:id` · `POST /eval/cases/:id/run` · `POST /agents/:id/eval-runs` ·
     `POST /skills/:id/eval-runs` · `GET /eval/runs?owner_kind&owner_id&days` ·
     `GET /eval/runs/:id` · `POST /eval/runs/:id/promote` · `GET /eval/overview` ·
     `GET /eval/dashboard/:ownerKind/:ownerId?days` · `POST /eval/run-all`.
   - Zod params/body via `fastify-type-provider-zod`; `getContext` for workspace;
     domain errors → 404/409/422/503. Thin handlers only.
   - Implements: HTTP surface; NFR-4.
   - Governed by: `fastify-best-practices`, `zod`, `security`. Owner: implementer.

10. [wave 2] Integration tests — `server/test/eval-cases.it.test.ts`,
    `eval-runs.it.test.ts`, `eval-dashboard.it.test.ts`, plus a counting/capturing
    `MockLLMProvider` setup.
    - Cover AC-1–AC-3, AC-5, AC-6, AC-8, AC-11–AC-19, AC-26–AC-28, AC-34, AC-35,
      AC-37, AC-38, AC-40, AC-45–AC-47, AC-52, AC-61, AC-62, AC-64, AC-65; NFR-3
      (seeded 200 runs, p95), NFR-4 (cross-workspace 404), NFR-5 (captured logger).
    - Use `vi.waitFor` on background completion. Owner: test-writer.

11. [wave 2] `server/package.json` — `"verify:l06": "vitest run test/eval-
    test/contracts.test.ts"` (vitest filename filter → all `eval-*` unit and `.it`
    tests + contracts), and add the new contracts to `test/contracts.test.ts`
    parse checks. Implements AC-60. Owner: implementer.

**Wave 3 — client (depends on step 1; can run in parallel with wave 2 against mocked fetch)**

12. [wave 3] Hooks — `client/src/lib/hooks/eval.ts`, `lib/hooks/index.ts`.
    - Queries/mutations for every route in step 9; poll a running suite run every
      2 s until terminal, then invalidate cases/history/dashboard (AC-42).
    - Governed by: `react-best-practices`. Owner: implementer.

13. [wave 3] Shared eval components — `client/src/components/evals/`:
    `EvalsPanel` (metrics + banner + cases + trend + history; used by agent tab,
    skill tab and agent dashboard), `MetricKpiCards`, `RegressionBanner`,
    `CaseList`/`CaseRow`, `CaseEditorModal` (Diff / Files / PR meta tabs,
    DiffViewer preview from parsed diff, expectation rows, Run-on-save, field
    errors), `MetricTrendChart` (LineChart, tooltip: version · time · metrics ·
    cost), `RunHistoryTable` (2-selection + Compare), `CompareRunsModal` (old→new
    deltas, prompt line diff, config changes, per-case flips, case-set notice, noise
    hint, Promote with ConfirmDialog), `helpers.ts` (formatPct, delta pts,
    `lineDiff` LCS, `caseSetDiff`, expectation summary).
    - Diff/prompt/file text rendered as text only (NFR-4); accessible names on icon
      buttons and checkboxes, Esc closes modals (NFR-7).
    - Implements: AC-9, AC-10, AC-24 (n/a), AC-29–AC-33, AC-41–AC-43, AC-48–AC-50, AC-65 (hint).
    - Governed by: `frontend-architecture`, `react-best-practices`, `dataviz`.
      Owner: implementer.

14. [wave 3] Entry points —
    - `FindingCard.tsx` (+ `PrDetail` wiring): "Turn into eval case" button
      (disabled + tooltip when undecided; "Eval case ✓" when the id is in
      `/eval/cases/sources`) (AC-1, AC-2, AC-5, AC-6, AC-62 note toast).
    - `AgentEditor` `constants.ts`/`AgentEditor.tsx` + `agents/[id]/page.tsx`
      `VALID_TABS`: "Evals" tab → `EvalsPanel` (owner agent) + "View full dashboard →".
    - `SkillEditor` tabs: "Evals" → `EvalsPanel` (owner skill) + host-agent picker
      (AC-51, AC-63).
    - Pages `client/src/app/evals/page.tsx` (overview: agent rows with sparkline,
      Run all agents, recent runs) and `client/src/app/evals/agents/[id]/page.tsx`
      (agent dashboard: switcher, period filter, Run eval, `EvalsPanel` in
      dashboard layout) (AC-37–AC-40).
    - `client/src/vendor/ui/nav.ts` + `nav.test.ts`: SKILLS LAB item
      `{ key: "evals", label: "Eval Dashboard", href: "/evals" }` (AC-36).
    - `client/messages/en/eval.json` (+ `prReview.json` for the button).
    - Governed by: `frontend-architecture`, `next-best-practices`. Owner: implementer.

15. [wave 3] Component tests — next to each component (`*.test.tsx`) for AC-5,
    AC-6, AC-9, AC-10, AC-24, AC-29–AC-33, AC-36, AC-39, AC-41–AC-43, AC-48, AC-50,
    AC-51, AC-63, NFR-4 (`<script>` literal), NFR-7. Owner: test-writer.

**Wave 4 — developer-side guards (independent of waves 2–3)**

16. [wave 4] Harness skill eval — `evals/skills/frontend-architecture/
    frontend-architecture.cases.ts`, `frontend-architecture.eval.ts`, `fixtures/*`.
    - 3–4 cases following `evals/skills/dependency-checker/*`: e.g. a page component
      placed in `src/components/` (must say → colocated `_components/`), a fetch
      inside a component (→ `lib/hooks`), a deep import from `vendor/ui/primitives`
      (→ barrel), a constant inside a component file (→ `constants.ts`).
      `patternMatch` grounding for the concrete fact + judge practices.
    - Calibrate; then break the skill (invert one rule) → red; revert → green;
      keep the console output for the video/PR (AC-53, AC-54).
    - Owner: implementer (run requires the user's OpenRouter key).

17. [wave 4] Commit test gate — `.claude/hooks/commit-test-gate.mjs`,
    `.claude/settings.json`.
    - PreToolUse, matcher `Bash`; the script reads the hook JSON from stdin, acts
      only when `tool_input.command` matches `\bgit\s+commit\b`, runs
      `scripts/verify-changed.sh`, and on failure exits 2 with the failing
      checks on stderr (Claude Code shows it to the model and blocks the call).
    - Implements AC-55. Governed by: `update-config` (settings), `security` (no
      command interpolation). Owner: implementer.

18. [wave 4] Mutation testing — `server/stryker.config.mjs`,
    `server/package.json` (`@stryker-mutator/core`,
    `@stryker-mutator/vitest-runner`, script `mutation:eval`).
    - Mutate `src/modules/eval/pipeline/scoring.ts` only, test files
      `test/eval-scoring.test.ts`. Record the first report, add tests killing each
      survivor (or document an equivalent mutant), re-run to 0 unexplained
      survivors (AC-57). Owner: test-writer.

**Wave 5 — finish, docs, manual acceptance**

19. [wave 5] Docs — `server/docs/eval-pipeline.md` (how scoring works, frozen
    inputs, API), `docs/evals/mutation-testing.md` (before/after report),
    `docs/evals/commit-hook.md` (the real blocked-commit instance, AC-56),
    `docs/evals/l06-experiment.md` (run table for AC-59). INSIGHTS entries via the
    `engineering-insights` skill. Owner: doc-writer / implementer.

20. [wave 5] Verification — `./scripts/verify-changed.sh --full`, `pnpm
    arch:check`, `pnpm verify:l06` (needs Docker), client `pnpm test` +
    `typecheck`, `scripts/check-vendor-shared-sync.sh`. Owner: implementer.

21. [wave 5] **Manual, by you** — `cd server && pnpm db:migrate`; start the app;
    create ≥ 8 cases from real accepted/dismissed findings (both types) (AC-58);
    run → edit prompt → run → Compare; then a deliberately degraded prompt (e.g.
    "Flag every style issue and unused import") → run → Compare to see precision
    drop (AC-59); screenshot the compare view; record the narrated video.

### Test plan (by AC)
| Level | ACs |
|---|---|
| unit (server) | AC-4, AC-7, AC-20–AC-25, AC-41 (alert text), AC-44, NFR-2 |
| integration (server) | AC-1–AC-3, AC-5, AC-6, AC-8, AC-11–AC-19, AC-26–AC-28, AC-34, AC-35, AC-37, AC-38, AC-40, AC-45–AC-47, AC-49, AC-52, AC-61, AC-62, AC-64, AC-65, NFR-1, NFR-3–NFR-5 |
| unit (reviewer-core) | AC-65 (request unchanged when absent) |
| component (client) | AC-5, AC-6, AC-9, AC-10, AC-24, AC-29–AC-33, AC-36, AC-39, AC-42, AC-43, AC-48, AC-50, AC-51, AC-63, NFR-4, NFR-7 |
| contract parity | NFR-6 |
| manual | AC-53–AC-60 |

### Risks
- **LLM cost/time** for runs: 8–20 cases × one call each; the demo uses a cheap
  model. Runs are async with a 30-min stale guard.
- **Model noise** can flip a case between runs; mitigated by temperature 0 and the
  noise hint (AC-65); the experiment uses a strong prompt change so the shift is
  well above noise.
- **Migration on existing data:** existing `eval_runs` rows (none expected) get
  `suite_run_id` null — the column is nullable and old rows are ignored by the UI.
- **Vendored contract drift** (CRLF): mitigated by the sync script in step 20.

### Open questions / assumptions
None blocking. Assumptions adopted from the requirements review: stale-run sweep
(30 min), unique case per (owner, finding), compare orders by `started_at`.
