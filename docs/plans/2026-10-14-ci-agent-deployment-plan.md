# Development Plan: Deploy review agents to GitHub Actions (Export to CI, CI Runs, agent CI tab)
Spec: specs/2026-10-14-ci-agent-deployment.md
Status: approved

## Development Plan: Deploy review agents to GitHub Actions (Export to CI, CI Runs, agent CI tab)

### Requirements review

**Source.** `specs/2026-10-14-ci-agent-deployment.md` (SPEC-07), `Status: approved`, amended and re-approved on the user's explicit instruction.
- It now contains AC-1…AC-100, EC-1…EC-54, NFR-1…NFR-6 and decisions D-1…D-34.
- This is **revision 2** of the plan. Revision 1 planned the single-agent spec (AC-1…AC-80). It was rewritten for:
  - D-27…D-33: several agents per repo, per-agent folder, workflow, branch, check and artifact, a slug fixed at first install, and attribution by API workflow path;
  - D-28 / AC-88: the `skipped` status;
  - AC-89: the missing-bundle error;
  - D-34 / AC-91…AC-100: "Remove from CI".

**User answers to revision-1 questions** (relayed by the coordinator):
- Q1: the `yaml` + `fflate` (server) and `yaml` (client) dependencies are allowed.
- Q2: multiple agents per repo (D-27…D-33). Supersedes A1.
- Q3: a new "skipped — secrets unavailable" status, decided from API data only (D-28). Supersedes A2.
- Q4: `scripts/dev.sh` does not build `agent-runner`; Preview and Install return an error naming the build command (AC-89).

**Spec claims checked against the code (branch `L07-ci-deployment`, 2026-10-14). All hold.**
- **CI module and tables are unused.** There is no `server/src/modules/ci/`. `ci_installations` / `ci_runs` are referenced only from the `db/schema.ts` barrel.
- **`commitFiles` force-moves the branch.** It uses `updateRef(..., force: true)` (`server/src/adapters/github/octokit.ts:309-316`) and treats any `getRef` error as "missing". Its only callers are `adapters/mocks.ts` and `test/adapters.test.ts`.
- **`agent_runs` is read without a source filter in these places:**
  - `pulls/repository.ts:157-167` (keyed by `pr_id`);
  - `reviews/repository/run.repo.ts:40-50` (keyed by `pr_id`) and `:105-112` (only `running`);
  - `agents/repository.ts:98-114` (keyed by `agent_id` + `done`);
  - `skills/repository.ts:244-262` (skills pull-rate). The spec does not list this one.
- **Runner today** (`agent-runner/src/`):
  - it scans `agents/*.yaml` and requires exactly one (`manifest.ts:36-44`);
  - skills are read from `.devdigest/skills/` (`skills.ts:18`);
  - it ignores `.devdigest/` and `.github/workflows/` as prefixes (`diff.ts:21`);
  - the artifact has 9 fields (`artifact.ts:34-44`);
  - post method falls back to `github_review` (`index.ts:25-28`);
  - the direct-run guard compares strings (`index.ts:65-68`);
  - there is no skip, cap or memory handling.
  - `reviewPullRequest` already accepts `memory`.
  - Existing tests pin the old paths: `diff.test.ts:77-98` and `run.test.ts:157,200`.
- **Client editor and nav.**
  - The agent editor has 4 tabs (`AgentEditor/constants.ts:11-16`) and `VALID_TABS` has no `ci` (`app/agents/[id]/page.tsx:15`). `editor.tabs.ci` already exists in `messages/en/agents.json`.
  - `vendor/ui/nav.ts` has no CI Runs item, and `nav.test.ts` pins SKILLS LAB to 4 keys.
- **`agent-runner/` is not covered by tooling.** `scripts/verify-changed.sh` and CI do not cover it, and `dist/` is git-ignored.
- **Vendored files.** Both copies of `contracts/eval-ci.ts` and `adapters.ts` are byte-identical and CRLF in the working tree.
- **Arch-check naming.** The `.dependency-cruiser.cjs` INNER regex only matches `service|run-executor|helpers|status|constants|findings|diff-loader` plus `pipeline/`. New pure or orchestration files in `ci/` must use those names or live in `ci/pipeline/` (`server/INSIGHTS.md` 2026-09-30).

**Recommendations to the spec owner, rechecked against the amended spec.** The spec was not edited.
- **Resolved by the spec:**
  - R1 (multi-agent, D-27);
  - R2 (skipped status, D-28);
  - R6 (re-export deletes the agent's stale memory file, AC-82);
  - R11 (dependencies, user-approved).
- **Still open (non-blocking, each has an assumption):**
  - R3 (no reason code for run id / attempt / PR-number mismatch) → A3;
  - R4 (size metric for the AC-71 ordering) → A4;
  - R5 (memory rows, line format and whether the runner uses them) → A5;
  - R7 (the skills pull-rate reader also breaks D-13) → A7;
  - R8 (non-OpenRouter model ids) → A8;
  - R9 (real action SHAs must be looked up) → A9;
  - R10 (the ESM bundle runs without `"type":"module"`) → A10.
- **New (non-blocking):**
  - **R12.** AC-69's verify asks for `foreign_workflow` log entries for runs of files no installation owns, including `other.yml`. Finding those needs a repo-wide run listing plus an artifact listing per foreign run on every refresh. The spec gives no bound on that cost → A19.
  - **R13.** Re-export or "Update CI config" while an installation is `removal_pending` is undefined → A20.
  - **R14.** Clarify AC-84's wording. As written, an existing `.devdigest/agents/<slug>/` folder is a collision even when it is the same agent's own folder from an earlier zip download. The user-confirmed interpretation (A21) is narrower: only a *different* agent's folder or workflow counts as a collision. The same agent's folder, identified by the manifest's agent identity, is adopted. The spec should say so.

**Clarifications.** I ran as a subagent without `AskUserQuestion`. All remaining doubts are vetoable assumptions, listed under "Open questions / assumptions".

**Execution mode.** Single-agent pass, as the caller instructed. No subagents were used.

### Scope

This plan:
- adds a server `ci` module that covers:
  - per-agent preview and generation of `.devdigest/agents/<slug>/**` and `.github/workflows/devdigest-review-<slug>.yml`;
  - slug allocation (fixed at first install, with `-2` / `-3` suffixes);
  - Actions-secret name status;
  - install by PR on `devdigest/ci-<slug>` (fast-forward only, touching only that agent's paths) or by zip;
  - "Remove from CI" through a removal PR on `devdigest/ci-<slug>-remove`, with the `removal_pending` → `removed` / active lifecycle;
  - installation records;
  - pull-only ingest with attribution by API workflow path, every AC-43…AC-90 check, and the `skipped` / `failed` / `result_expired` / `rejected` statuses;
  - the CI Runs and agent-CI-tab read models;
- extends both `ci_*` tables through one generated migration;
- makes the GitHub adapter non-forcing and adds a CI GitHub port;
- updates the shared contracts in both vendored copies;
- extends `agent-runner/` with:
  - the per-agent folder (one manifest per run);
  - fork / Dependabot skip;
  - the per-agent ignore rule;
  - the diff cap with partial review;
  - the AC-41 artifact;
  - the post method passed from the workflow;
  - secret redaction;
  - memory loading;
- excludes CI runs from agent-list stats (and from the skills pull-rate, A7);
- adds the client CI tab (with removal), the four-step wizard and `/ci-runs`.

It does **not** change:
- `server/src/modules/reviews/**` or `server/src/modules/pulls/**`. CI rows always have `agent_runs.pr_id = NULL`, so the PR feed excludes them by construction (AC-49);
- `reviewer-core/src/**`;
- `mcp-server/`, `e2e/` flow JSON, `scripts/dev.sh`, other CI generators, rulesets, cost caps, or a GitHub App.

### Modules affected

**server**
- new `src/modules/ci/**`, plus registration in `modules/index.ts`;
- `db/schema/ci.ts` and one generated migration;
- `adapters/github/octokit.ts`, `adapters/mocks.ts`;
- `platform/container.ts`, `platform/config.ts`;
- `vendor/shared/{adapters.ts,contracts/eval-ci.ts}`;
- `modules/agents/repository.ts` (AC-66) and `modules/skills/repository.ts` (A7), one filter each;
- `package.json` and lockfile;
- `server/test/*`.

**client**
- new `src/app/ci-runs/**` and `src/components/ci-runs/**`;
- new `AgentEditor/_components/CiTab/**`, plus `AgentEditor.tsx`, `constants.ts` and `app/agents/[id]/page.tsx`;
- `src/lib/api.ts`, new `src/lib/hooks/ci.ts`, `src/lib/hooks/index.ts`;
- the mirrored `src/vendor/shared/**`;
- `src/vendor/ui/{nav.ts,nav.test.ts,ExportWizardSteps.tsx}`;
- `messages/en/ci.json`;
- `package.json` and lockfile.

**agent-runner**
- `src/{context,diff,artifact,run,index,manifest,skills}.ts`;
- new `src/{skip,diff-cap,summary,memory,redact}.ts`;
- tests;
- the env table in `README.md`.

**reviewer-core**: read only. The grounding gate, `toReviewPayload`, `countBlockers` and `gateTriggered` are reused unchanged.

**e2e / mcp-server**: not touched.

### Architectural constraints

**Root `AGENTS.md`**
- `@devdigest/shared` is vendored twice. Mirror it byte-for-byte (NFR-5).
- Migrations never run on boot.
- Lessons are recorded only through the `engineering-insights` skill.

**`server/AGENTS.md` + `onion-architecture`**
- **Routes.** `routes.ts` does schema → one service call → return, and imports no Drizzle, `db/*` or `adapters/*`.
- **Persistence.** Only `ci/repository.ts` touches Drizzle. It maps rows to domain types; no `$inferSelect` aliases leak out.
- **Service dependencies.** The service and the `pipeline/*` orchestration take an explicit `CiDeps` of ports declared in `ci/types.ts`, never the `Container`.
- **Composition root.** `platform/container.ts` is the only place that wires adapters and other modules' repositories.
- **No cross-module imports.** `ci` may not import `skills/helpers.ts` (`slugify`) or `agents/repository.ts`. It declares structural port types instead, as `eval/types.ts` does (`server/INSIGHTS.md` 2026-10-13).
- **Adapters** may not import modules, so the CI GitHub port lives in `vendor/shared/adapters.ts`.
- **Arch-check coverage.** Pure and orchestration files go in `helpers.ts`, `constants.ts` or `pipeline/*.ts`, so the INNER rules cover them.
- **Baseline.** The arch baseline may only shrink.

**`server/INSIGHTS.md`**
- **Migrations.** Generate with `pnpm db:generate`, never by hand. `ci.ts` is already exported from the barrel. Read the SQL: it should be ADD COLUMN, constraint and index only (2026-09-20, 2026-10-10). `ADD COLUMN NOT NULL` is safe only because both tables are empty (nothing writes or seeds them).
- **Empty POST bodies** arrive as `null`. Use `.nullish()` / `z.preprocess` for body-less POSTs (2026-10-11, 2026-10-13).
- **Integration tests.** Name them `*.it.test.ts` and check the `skipped` count (2026-09-20).
- **CRLF vendored files.** Mirror by copying the whole file, then check with `check-vendor-shared-sync.sh` and `git ls-files --eol` (2026-09-24, 2026-10-11).
- **Logger port.** The container passes `console`; tests spy on it (2026-10-10).
- **Secrets** come only through `SecretsProvider`.
- **CLI guard.** Use the `fileURLToPath(import.meta.url) === resolve(argv[1])` form (2026-09-16). This also applies to `agent-runner/src/index.ts`.

**`client/AGENTS.md` + `frontend-architecture` + `client/INSIGHTS.md`**
- **Thin pages.** `page.tsx` stays thin. Data flows `lib/api.ts` → `lib/hooks/ci.ts` → component; components never fetch.
- **UI imports.** UI comes only from the `@devdigest/ui` barrel. A changed vendored UI component keeps its `Showcase.tsx` entry.
- **Strings** go in `messages/en/ci.json`.
- **Placement.** Components used by one route go in that route's `_components/`. The CI-runs table serves two routes (the CI Runs page and the CI tab), so it is promoted to `src/components/ci-runs/`.
- **Tests.** `@testing-library/user-event` is not installed, so use `fireEvent` (2026-09-30). Hook tests that need a provider must be `.tsx` (2026-10-11).

**`agent-runner/CLAUDE.md` + `insights/INSIGHTS.md`**
- **Reviewer-core invariants.** Keep the mandatory `groundFindings`, `assemblePrompt` / `wrapUntrusted`, and the deterministic verdict and exit code.
- **Secrets.** Reading `process.env` is correct here.
- **Bundle.** Self-contained ncc bundle using hand-rolled `fetch`.
- **Failure handling.** One top-level hard-fail catch: nothing is posted and no artifact is written. Discriminate the result on `artifact === null`.
- **Contracts.** `@devdigest/shared` resolves to `server/src/vendor/shared` source.
- **Typecheck** needs `reviewer-core/node_modules`.

**`reviewer-core/AGENTS.md`**
- `reviewer-core-zero-io` and `reviewer-core-ground-findings-gate` apply. This package is untouched, so the diff cap lives in the runner.

### Steps

**Execution model for the orchestrator**
- Waves run in order.
- Steps inside a wave own disjoint files (see "File ownership") and can run as parallel implementer / test-writer agents.
- After every wave, run `bash scripts/verify-changed.sh` plus the agent-runner commands under "Verification scope".
- Step 4 is test-first and stays red until step 9.

**Path conventions** (D-27…D-30, D-34), used by every step. They are exported once from the shared contracts (step 1):

| Item | Path / name |
|---|---|
| Agent folder | `.devdigest/agents/<slug>/` |
| Manifest | `<folder>manifest.yaml` |
| Skills | `<folder>skills/<skill-slug>.md` |
| Runner | `<folder>runner/index.js` |
| Memory | `<folder>memory.jsonl` |
| Workflow | `.github/workflows/devdigest-review-<slug>.yml` |
| Artifact | `devdigest-result-<slug>` |
| Install branch | `devdigest/ci-<slug>` (alternative `devdigest/ci-<slug>-YYYYMMDD-HHMMSS`) |
| Removal branch | `devdigest/ci-<slug>-remove` (alternative `devdigest/ci-<slug>-remove-YYYYMMDD-HHMMSS`) |
| Workflow name | `DevDigest review (<slug>)` |
| Job `name`, which is the check name | `devdigest-review-<slug>` |
| Concurrency group | `devdigest-review-<slug>-${{ github.event.pull_request.number }}` |

#### Wave 1 — foundations

1. **[wave 1] Shared contracts and the CI GitHub port, in both vendored copies.**
   - **Implements:** AC-30 / AC-41 / AC-44 / AC-47 / AC-50 / AC-73 / AC-83 / AC-88 / AC-91 contracts, AC-48, NFR-5.
   - **Governed by:**
     - `zod`;
     - `onion-architecture` (ports in `vendor/shared/adapters.ts`; request/response envelopes are validated at the route edge, not in services);
     - `typescript-expert`.
   - **Owner:** implementer.
   - **Files:**
     - `server/src/vendor/shared/contracts/eval-ci.ts` → `client/src/vendor/shared/contracts/eval-ci.ts`;
     - `server/src/vendor/shared/adapters.ts` → `client/src/vendor/shared/adapters.ts`.
   - **`eval-ci.ts`, "Export-to-CI + CI Runs" section.** The `AgentManifest` shape is unchanged.
     - **`AgentManifest`:** add one optional field, `studio_agent_id: z.string().uuid().optional()`. It is the agent identity used to adopt a zip-installed folder (A21). Existing manifests still validate, and AC-5's fields are unchanged.
     - **Constants:**
       - `CI_WORKFLOW_VERSION = 1`, `CI_RESULT_MAX_BYTES = 1_048_576`;
       - `CI_ARTIFACT_PREFIX = 'devdigest-result-'`;
       - `CI_RUNNER_BUILD_COMMAND = 'cd agent-runner && pnpm build'`.
     - **`CiSlug`:** `^[a-z0-9]+(-[a-z0-9]+)*$`, max 60.
     - **Pure path helpers:** `ciAgentDir(slug)`, `ciManifestPath`, `ciSkillPath(slug, skillSlug)`, `ciRunnerPath`, `ciMemoryPath`, `ciWorkflowPath(slug)`, `ciArtifactName(slug)`, `ciInstallBranch(slug)`, `ciRemovalBranch(slug)`, `ciCheckName(slug)`.
     - **Enums:**
       - `CiPostAs` = `github_review|pr_comment|none`;
       - `CiTrigger` = `opened|synchronize|reopened`;
       - `CiInstallationStatus` = `active|removal_pending|removed`;
       - `CiRunStatus` = `succeeded|failed|skipped|result_expired|rejected`;
       - `CiRejectReason` = `too_large|schema|repository_mismatch|sha_mismatch|agent_inactive|workflow_modified`.
     - **`CiPreviewInput`:** `repo_id` (uuid); `triggers` (min 1, unique); `post_as`; `memory_export`.
     - **`CiPreviewFile`:** `path`; `editable`; `contents: string | null` (null only for the runner, A11); `size_bytes`; `sha256`.
     - **`CiPreview`:** `repo_full_name`, `default_branch`, `slug`, `workflow_path`, `check_name`, `workflow_version`, `files`.
     - **`CiSecretsStatus`:** `openrouter_api_key: set|not_set|required`, `github_token: 'provided'`.
     - **`CiInstallInput`:** `CiPreviewInput` plus `workflow_yaml: string | null` (max 65,536) and `branch?: string`.
     - **`CiInstallResult`:** `installation`, `pr_url`, `branch`, `reused_pr`.
     - **`CiRemoveInput`:** nullish body; `branch?: string`.
     - **`CiRemoveResult`:**
       - `installation`;
       - `outcome: removal_pr_opened|removal_pr_reused|removed_directly`;
       - `pr_url | null`;
       - `install_pr_url | null` (AC-98).
     - **`CiInstallation` (rewritten):**
       - `id`, `agent_id`, `repo_id`, `repo`, `repo_github_id`, `target_type`;
       - `slug`, `workflow_path`, `check_name`;
       - `workflow_version`, `branch`, `pr_url`, `pr_number`, `pr_state` (`open|merged|closed|null`);
       - `status`, `removal_pr_url`;
       - `exported_ci_fail_on`, `installed_at`, `updated_at`;
       - `latest_run: { status, ran_at } | null`.
     - **`CiRun` (rewritten):**
       - `id`, `status`, `reason`, `ran_at`;
       - `repo`, `pr_number`, `head_sha`;
       - `agent_id`, `agent_name`, `agent_slug`, `installation_status`;
       - `verdict`, `findings_count`, `critical`, `warning`, `suggestion`, `blockers`;
       - `cost_usd`, `duration_ms`;
       - `partial`, `skipped_count`;
       - `run_url` (nullable), `workflow_run_id`, `run_attempt`, `version`.
     - **`CiAgentOverview`:** `installations`, `active_repos`, `current_workflow_version`, `runs`.
     - **`CiRefreshResult`:** `accepted`, `rejected`, `failed`, `skipped`, `result_expired`, `removed`, `reactivated`, `errors[]`.
     - **`CiResultArtifact` (rewritten to the AC-41 allowlist, `.strict()`):**
       - `repository_id`, `repository`, `pr_number`;
       - `head_sha` as `z.string()`: the format is checked at ingest → `sha_mismatch` (AC-46);
       - `workflow_run_id`, `workflow_run_attempt`;
       - `agent`, `agent_slug`, `version`;
       - `verdict` (`APPROVE|COMMENT|REQUEST_CHANGES`);
       - `findings_count`, `critical`, `warning`, `suggestion`, `blockers`;
       - `cost_usd` (nullable), `duration_ms`;
       - `partial`, `skipped_files` (string[]).
     - **Remove** the unused `CiExportInput`, `CiExportInputBody`, `CiExport` and `CiFile` (verified: no consumers).
   - **`adapters.ts`:**
     - `GitHubClient.findOpenPr` → `{ url; number } | null`.
     - `commitFiles` is documented as fast-forward only, never forced.
     - `CommitFilesPayload.deletePaths?: string[]`; `files` may be empty for a deletion-only commit.
     - **New `GitHubCiClient` methods:**
       - `getRepository` → `{ id, defaultBranch, fullName }`;
       - `getBranchSha` (404 → null);
       - `listActionsSecretNames`;
       - `listWorkflowRuns(repo, workflowFile, { perPage })`;
       - `listRepoWorkflowRuns(repo, { perPage })` (A19);
       - `listRunArtifacts` → `{ id, name, sizeInBytes, expired, workflowRunId }[]`;
       - `downloadArtifactZip`;
       - `getFileBlobSha(repo, path, ref)` (404 → null);
       - `pathExists(repo, path, ref)` (file or dir);
       - `getFileText(repo, path, ref)` (UTF-8, at most 64 KiB; 404 → null), used to read an existing agent manifest for adoption;
       - `listTreePaths(repo, ref, prefix)` (recursive tree, filtered by prefix);
       - `getPullState(repo, n)` → `{ state, merged }`.
     - **`CiWorkflowRun`** = `{ id, runAttempt, status, conclusion, event, path, headSha, createdAt, repoFullName, headRepoFullName | null, triggeringActor | null, pullRequests: { number, baseSha }[] }`.
   - **Mirroring:** edit the server copy, then copy the whole file over the client copy, keeping CRLF.

2. **[wave 1] Dependencies.**
   - **Files:** `server/package.json` + `server/pnpm-lock.yaml` (add `yaml ^2.6.1`, `fflate`); `client/package.json` + `client/pnpm-lock.yaml` (add `yaml`).
   - **Implements:** enables AC-5, AC-29, AC-44, AC-56, AC-57.
   - **Governed by:** `security` (A03 supply chain; commit the lockfiles).
   - **Before editing:** check `git ls-files -v | grep '^S'` for skip-worktree files.
   - **Owner:** implementer.

3. **[wave 1] DB schema and generated migration.**
   - **Files:** `server/src/db/schema/ci.ts`, `server/src/db/migrations/0022_*.sql`, `server/src/db/migrations/meta/*`.
   - **Implements:** AC-30, AC-47, AC-48, AC-59, AC-65, AC-80, AC-83, AC-84, AC-88, AC-91, AC-95…AC-100.
   - **Governed by:**
     - `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`;
     - migration generated by `pnpm db:generate`;
     - GitHub ids as `bigint` (`mode: 'number'`);
     - explicit indexes on FK columns;
     - `timestamptz`, `text`; status columns as `text` plus a CHECK or a Drizzle enum (evolving values).
   - **`ci_installations` adds:**
     - `workspace_id` (uuid NOT NULL → workspaces, cascade);
     - `repo_id` (uuid NOT NULL → repos, cascade);
     - `repo_github_id` (bigint NOT NULL);
     - `slug` (text NOT NULL), `workflow_path` (text NOT NULL);
     - `workflow_version` (int NOT NULL), `branch` (text NOT NULL);
     - `pr_url`, `pr_number` (int), `pr_state`;
     - `status` (text NOT NULL default `'active'`; `active|removal_pending|removed`);
     - `removal_branch`, `removal_pr_url`, `removal_pr_number`, `removed_at`;
     - `exported_ci_fail_on` (text NOT NULL);
     - `updated_at`.
   - **`ci_installations` constraints:**
     - unique `(agent_id, repo_id)` (AC-30: one row per agent and repo; re-add after removal reuses the row, EC-53);
     - partial unique `(repo_id, slug) WHERE status <> 'removed'` (AC-84: a removed installation releases its slug);
     - indexes on `repo_id` and `workspace_id`.
     - Keep `agent_id → agents` as `ON DELETE CASCADE` (EC-23 / EC-42).
   - **`ci_runs` adds:**
     - `workspace_id` (NOT NULL, cascade);
     - `repo_id` (→ repos, set null), `repo_full_name` (NOT NULL), `repo_github_id` (bigint);
     - `workflow_path`, `agent_slug`;
     - `workflow_run_id` (bigint NOT NULL), `run_attempt` (int NOT NULL), `head_sha`;
     - `agent_id` (→ agents, set null), `agent_name`;
     - `agent_run_id` (→ agent_runs, set null);
     - `reason`, `verdict`, `critical`, `warning`, `suggestion`, `blockers`, `duration_ms`;
     - `partial` (bool NOT NULL default false), `skipped_files` (jsonb), `version`.
     - `status` holds `succeeded|failed|skipped|result_expired|rejected`.
   - **`ci_runs` constraints:**
     - unique `(workspace_id, workflow_run_id, run_attempt)` (AC-48);
     - indexes `(workspace_id, ran_at)`, `agent_id`, `ci_installation_id`.
   - **Check the generated SQL:** ADD COLUMN, constraints and indexes only. No DROP.
   - **Owner:** implementer.

4. **[wave 1, test-first] Workflow-generator lint test: `server/test/ci-workflow.test.ts`.**
   - **Tests:** AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-15, AC-16, AC-18, AC-19 (step), AC-61, AC-86, NFR-1 (a–j), and the generator side of AC-24.
   - **Target signature:** `generateWorkflow({ slug, triggers, postAs, version }): string` from `server/src/modules/ci/pipeline/workflow.ts`.
   - **Method:** parse with `yaml`. Run every combination of 3 trigger sets × 3 post methods, and repeat with two slugs `a` and `b`.
   - **Assertions:**
     - `on` is only `pull_request.types`;
     - permissions are exactly `{contents: read, pull-requests: write | read}`;
     - every executed `uses:` matches `owner/repo@<40 hex>`;
     - no `${{ … github.event … | github.head_ref }}` appears inside any `run:`;
     - `OPENROUTER_API_KEY` appears only as the runner step's `env` from `secrets.*`;
     - the runner step runs `node .devdigest/agents/<slug>/runner/index.js`, with env `DEVDIGEST_AGENT_SLUG: <slug>` and `DEVDIGEST_POST_AS: <method>`;
     - `devdigest/review-action@v1` appears only in a comment;
     - checkout has `ref: ${{ github.event.pull_request.base.sha }}` and `persist-credentials: false`;
     - the `concurrency.group` contains the slug and `github.event.pull_request.number`, with `cancel-in-progress: true`, and the `a` and `b` groups differ;
     - the upload step has `name: devdigest-result-<slug>`, `if: always()` and `if-no-files-found: ignore`;
     - the workflow `name` and the job `name` contain the slug; the `a` and `b` check names differ; regenerating `a` gives the same check name;
     - top-level env has `DEVDIGEST_MAX_DIFF_BYTES: "204800"` and `DEVDIGEST_MAX_DIFF_LINES: "3000"`.
   - **Expected:** red until step 9.
   - **Governed by:** `onion-architecture` (`rules/testing.md`).
   - **Owner:** test-writer.

5. **[wave 1] Runner per-agent ignore rule and diff cap.**
   - **Files:** `agent-runner/src/diff.ts`, new `agent-runner/src/diff-cap.ts`, `agent-runner/src/diff.test.ts` (trivial update of the existing cases to the new rule only).
   - **Implements:** AC-60, AC-71, AC-79, EC-15, EC-29, EC-30, EC-34, EC-35, EC-40, EC-41.
   - **Governed by:**
     - `agent-runner/CLAUDE.md` (self-contained bundle, no server imports);
     - `typescript-expert`;
     - `security` (paths are PR-controlled).
   - **Changes:**
     - `stripIgnoredFiles(raw, ownWorkflowPath)` drops a file when its path starts with `.devdigest/` OR equals `ownWorkflowPath` exactly. Every other `.github/workflows/*` file is reviewed, including other agents' `devdigest-review-*.yml` (D-31).
     - `resolveDiffCaps(env, log)`: positive-integer parse; defaults 204,800 bytes and 3,000 lines; one log line per fallback.
     - `applyDiffCap(raw, caps)`:
       - split the diff into per-file sections;
       - order by changed lines descending, then bytes descending, then path ascending (A4);
       - take sections greedily while the cumulative bytes ≤ the byte cap AND the cumulative lines ≤ the line cap;
       - return `{ raw (kept sections in original order), skipped, caps, partial }`.
   - **Owner:** implementer.

6. **[wave 1] Exclude CI runs from agent and skill stats.**
   - **Files:** `server/src/modules/agents/repository.ts` (`statsForAgents` query 2, lines 98-114); `server/src/modules/skills/repository.ts` (pull-rate join, line 253).
   - **Change:** add `eq(t.agentRuns.source, 'local')` in both places.
   - **Implements:** AC-66, D-13 (A7).
   - **Governed by:** `onion-architecture`, `drizzle-orm-patterns` (repository-only change).
   - **Constraint:** do not touch `pulls/**` or `reviews/**`.
   - **Owner:** implementer.

#### Wave 2 — adapters, pure CI domain, persistence, runner core, client data layer (after wave 1)

7. **[wave 2, after 1] GitHub adapter and mock.**
   - **Files:** `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`.
   - **Implements:** AC-26, AC-27, AC-58, AC-81, AC-82, AC-84 (path checks), AC-88 (run fields), AC-91…AC-94, AC-98, AC-22 / AC-67 / AC-68 (secrets list only), AC-69, AC-74…AC-76.
   - **Governed by:**
     - `onion-architecture` (`rules/adapters.md`: anti-corruption translation; no `modules/**` imports);
     - `security`.
   - **`OctokitGitHubClient implements GitHubClient, GitHubCiClient`.**
   - **`commitFiles`:**
     - on `getRef`, only 404 means "missing"; other errors rethrow;
     - `updateRef` with `force: false`;
     - `deletePaths` → tree entries with `sha: null`;
     - large contents (the runner bundle) go through `git.createBlob` as base64 (A12);
     - write calls are not retried except on 429, so a failed write is never replayed.
   - **`findOpenPr`** also returns `number`.
   - **New methods map to:** `repos.get`, `git.getRef`, `actions.listRepoSecrets` (names only), `actions.listWorkflowRuns({ workflow_id: <file name>, status: 'completed', event: 'pull_request' })`, `actions.listWorkflowRunsForRepo`, `actions.listWorkflowRunArtifacts`, `actions.downloadArtifact({ archive_format: 'zip' })`, `repos.getContent`, `git.getTree({ recursive: true })` (if the result is `truncated` → throw a clear error), and `pulls.get`.
   - **`CiWorkflowRun` field mapping:**
     - `path`, `head_sha`;
     - `repository.full_name`, `head_repository.full_name`;
     - `triggering_actor.login`;
     - `pull_requests[].{number, base.sha}`.
   - **Errors:** keep Octokit's `status` on thrown errors (AC-28, AC-99).
   - **`MockGitHubClient`** implements both interfaces and adds:
     - a `calls: { op, args }[]` log;
     - configurable `repository`, `branches`, `openPrs`, `secretNames | secretsError`, `runs` (per workflow file and repo-wide), `artifacts`, `artifactZips`, `blobs` (`path@ref`), `trees`, `pullStates`;
     - `failOn: Partial<Record<op, { status, message }>>`.
   - **Owner:** implementer.

8. **[wave 2, after 1] CI ports, constants and pure helpers.**
   - **Files:** `server/src/modules/ci/types.ts`, `ci/constants.ts`, `ci/helpers.ts`.
   - **Implements:** AC-3 (repo port), AC-25 / AC-91 (titles), AC-26 / AC-92 (branch validation), AC-51, AC-59, AC-78, AC-83, AC-84, AC-87, NFR-2, NFR-3.
   - **Governed by:**
     - `onion-architecture` (structural ports; no `db/rows`; no cross-module import; `helpers.ts` is pure);
     - `security`.
   - **`types.ts` declares:**
     - `CiAgentsPort` (`getById`, `linkedSkills`, using structural types);
     - `CiStore` (the step-10 interface);
     - `githubCi()` and `github()` factories;
     - `readRunnerBundle(): Promise<string | null>` (null = not built);
     - `studioSecretValues()`, `CiLogger`, `now`.
   - **`constants.ts`:**
     - action pins `{ repo, sha, tagComment }` for checkout, setup-node and upload-artifact (A9);
     - PR title builders "Add DevDigest CI review: <name>" and "Remove DevDigest CI review: <name>";
     - install PR body template containing the AC-78 fork / Dependabot statement ("pass", "unreviewed", read the job-summary notice), the exact check name, and the AC-87 statement that it "can be marked required … independently of other DevDigest agents' checks";
     - run page size 50;
     - workflow max length.
   - **`helpers.ts` (pure):**
     - `slugify` (own copy);
     - `allocateSlug(base, taken: Set<string>)` → the lowest free of `base`, `base-2`, `base-3`, …;
     - `timestampSuffix(now)`;
     - `isAllowedInstallBranch(slug, name)` and `isAllowedRemovalBranch(slug, name)`, accepting only the exact default or default `-YYYYMMDD-HHMMSS`;
     - `buildRunUrl(fullName, runId)`;
     - `containsSecret(files, values)` (values of length ≥ 8);
     - `secretStatusFromNames`;
     - `isActiveRepo(installation, acceptedRuns)` (AC-59: not `removed`, and PR merged or ≥ 1 accepted run, A16);
     - `skillFileSlugs(skills)` (A13).
   - **Owner:** implementer.

9. **[wave 2, after 1-2] Pure generation, ingest-decision and lifecycle pipeline.**
   - **Files:** `server/src/modules/ci/pipeline/workflow.ts`, `ci/pipeline/manifest.ts`, `ci/pipeline/ingest-validate.ts`, `ci/pipeline/lifecycle.ts`.
   - **Implements:** AC-4, AC-5, AC-8…AC-13, AC-15…AC-19, AC-61, AC-62, AC-63, AC-82, AC-86, AC-44…AC-46, AC-64, AC-69, AC-74, AC-75, AC-76, AC-80, AC-88, AC-90, AC-96, AC-97, AC-98, NFR-1.
   - **Governed by:**
     - `onion-architecture` (`pipeline/` is INNER: no I/O imports);
     - `zod` (`safeParse` the untrusted artifact JSON; `JSON.parse` only inside try);
     - `security`.
   - **`workflow.ts`:**
     - `generateWorkflow` builds a deterministic template string (comments are required), following the path-convention table:
       - the AC-9 / AC-10 permissions;
       - checkout at the base SHA with `persist-credentials: false`;
       - pinned `setup-node` with Node 22 (A10);
       - the commented `devdigest/review-action@v1` placeholder;
       - a `run: node .devdigest/agents/<slug>/runner/index.js` step whose env holds the `secrets.*` values, `PR_NUMBER: ${{ github.event.pull_request.number }}`, the literal `DEVDIGEST_AGENT_SLUG` and `DEVDIGEST_POST_AS`;
       - the pinned upload step.
     - `lintWorkflow(text)` returns `{ parseError?: { line, message }, warnings[] }` and is used for the server-side 422.
   - **`manifest.ts`:**
     - `buildManifestYaml` uses `yaml.stringify` and self-checks with `AgentManifest.parse`. It always writes `studio_agent_id = agent.id`.
     - `isSameAgentManifest(yamlText, agentId)`: safe-parse the text and return true only when `studio_agent_id === agentId`. Invalid YAML or a missing id returns false, so the folder counts as foreign.
     - `buildSkillFiles` keeps skills that are `enabled && !injectionDetected`, in link order;
     - `buildMemoryJsonl(rows)` (A5);
     - `buildFileSet({ slug, … })` → `CiPreviewFile[]` under the agent folder plus the workflow;
     - `syncDeletes(existingPathsUnderAgentFolder, newPaths)` → `deletePaths` limited to `ciAgentDir(slug)` (AC-82: deletes the agent's own stale memory and skill files; A6).
   - **`ingest-validate.ts`: one pure decision per run.** The run has already been attributed by API `path` to exactly one active or removal-pending installation (AC-90). Checks, in fixed order:
     1. Not completed → `skip`.
     2. No artifact named `ciArtifactName(installation.slug)` for this run:
        - API data shows a fork (`headRepoFullName !== repoFullName`, or null) or `triggeringActor === 'dependabot[bot]'` → `skipped` (AC-88);
        - otherwise → `failed` (AC-75).
        - Artifact content is never consulted for this decision.
     3. Expired → `result_expired`.
     4. Agent missing or disabled → `agent_inactive`.
     5. Listing size or zip `originalSize` > 1 MB → `too_large`.
     6. JSON missing, invalid, or failing the contract → `schema`.
     7. `repository_id` ≠ `installation.repo_github_id` → `repository_mismatch`.
     8. Bad or different `head_sha`, or a run id / attempt / PR-number mismatch with the API data → `sha_mismatch` (A3).
     9. Blob of `installation.workflow_path` at the head SHA ≠ blob at the run's API `pullRequests[].baseSha`, either blob missing, or no API base SHA → `workflow_modified` (A14).
     - Otherwise → `accepted`.
     - The artifact's `agent` / `agent_slug` never affect attribution (AC-90).
   - **`lifecycle.ts`:**
     - `nextInstallStatusFromRemovalPr(state, merged)`: merged → `removed` (after ingest, AC-96); closed unmerged → `active` (AC-97); open → unchanged;
     - `planRemoval(presentPaths)` → `{ kind: 'removed_directly' } | { kind: 'pr', deletePaths }` (AC-98, including the case where only one of the two paths is present).
   - **Owner:** implementer.

10. **[wave 2, after 3] CI repository: `server/src/modules/ci/repository.ts` (`CiRepository implements CiStore`).**
    - **Implements:** AC-30, AC-31, AC-34, AC-47, AC-48, AC-50, AC-59, AC-63, AC-65, AC-80, AC-83, AC-84, AC-88, AC-95…AC-100, EC-12, EC-24, EC-53, EC-54.
    - **Governed by:**
      - `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`;
      - only this file touches Drizzle;
      - mapped return types;
      - workspace-scoped queries;
      - repository-internal `db.transaction` (precedent: `skills/repository.ts:57`).
    - **Repo and memory reads:**
      - `getRepo(workspaceId, repoId)`;
      - `listMemoryForExport` (A5).
    - **Installation queries:**
      - `findInstallation(agentId, repoId)` (any status);
      - `listRepoSlugsInUse(repoId)` (status ≠ removed, excluding this agent);
      - `upsertInstallation(...)`: on conflict `(agent_id, repo_id)`, update and set `status = 'active'`. The slug is passed in by the service and is never changed for an existing non-removed row.
      - `setRemovalPending`, `markRemoved`, `reactivate`;
      - `listInstallationsForAgent`;
      - `listPollableInstallations(workspaceId)` (`active` + `removal_pending`);
      - `updatePrState`.
    - **Run writes:**
      - `existingRunKeys(workspaceId)`.
      - `insertAcceptedRun(...)` runs in one transaction:
        1. insert into `ci_runs` `ON CONFLICT (workspace_id, workflow_run_id, run_attempt) DO NOTHING RETURNING id`;
        2. only when that inserted a row, insert `agent_runs` with `source='ci'`, `status='done'`, `pr_id = NULL` (always), the agent, findings / blockers / cost / duration, and `ran_at` = the run's `createdAt`;
        3. link `ci_runs.agent_run_id`.
      - `insertNonAcceptedRun(...)` for `failed`, `skipped`, `result_expired` and `rejected`: same conflict rule; no `agent_runs` row, findings, verdict or cost.
    - **Run reads:**
      - `listRuns(workspaceId, { agentId?, limit = 500 })`, newest first, joined with the installation status;
      - `acceptedRunCountsByInstallation`;
      - `latestRunPerInstallation`.
    - **Mapper:** drops any `github_url` that does not equal `buildRunUrl(...)`.
    - **Owner:** implementer.

11. **[wave 2, after 1, 5] Runner: per-agent folder, skip, context, artifact, post method, partial note, memory, redaction.**
    - **Files:**
      - `agent-runner/src/{context,manifest,skills,artifact,run,index}.ts`;
      - new `agent-runner/src/{skip,summary,memory,redact}.ts`;
      - `agent-runner/README.md` (env table);
      - trivial fixture-path updates in the existing `manifest.test.ts` and `run.test.ts` so they keep passing.
    - **Implements:** AC-12 / AC-17 (runtime side), AC-14, AC-18, AC-37…AC-41, AC-42 (redaction), AC-72, AC-85, EC-1, EC-2, EC-3, EC-19, EC-20, NFR-4 (fork case).
    - **Governed by:**
      - the `agent-runner/CLAUDE.md` invariants;
      - `security` (A09: never log secrets);
      - `typescript-expert`.
    - **Agent folder.**
      - `DEVDIGEST_AGENT_SLUG` is required and must match `CiSlug`; otherwise the runner hard-fails.
      - `agentDir = <DEVDIGEST_DIR ?? cwd/.devdigest>/agents/<slug>`.
      - `manifest.ts` loads exactly `<agentDir>/manifest.yaml` and no longer scans the folder. `skills.ts` reads `<agentDir>/skills/`. `memory.ts` reads `<agentDir>/memory.jsonl` if it is present. No other agent folder is ever read (AC-85).
    - **Context.** `context.ts` also resolves:
      - `repositoryId` (`GITHUB_REPOSITORY_ID` / event);
      - `headSha`;
      - `isFork` (head and base `full_name` differ, or `head.repo` is null);
      - `isDependabot` (`GITHUB_TRIGGERING_ACTOR ?? GITHUB_ACTOR` === `dependabot[bot]`, matching D-28);
      - `runId` and `runAttempt`.
    - **Skip (`skip.ts`) runs first,** before the manifest is loaded or the key is checked. It writes `::notice title=DevDigest::DevDigest review did not run: <reason>` and appends the same text to `$GITHUB_STEP_SUMMARY`, then exits 0. No LLM call, no POST and no artifact.
    - **`run.ts` pipeline:**
      1. empty `OPENROUTER_API_KEY` → hard-fail (AC-40);
      2. `stripIgnoredFiles(raw, ciWorkflowPath(slug))`;
      3. `applyDiffCap`;
      4. `reviewPullRequest` (with `memory`, A5);
      5. when the review is partial, append a "Partial review" section to the posted body and to the job summary. It lists every skipped path inside a fenced `text` block whose fence is longer than any backtick run in the paths, together with the caps that were applied (AC-72).
    - **Artifact.** `artifact.ts` produces exactly the AC-41 keys, including `agent_slug`, `verdict = payload.event` and `version = String(CI_WORKFLOW_VERSION)`.
    - **CLI (`index.ts`):**
      - uses the fixed direct-run guard;
      - prints one redacted error line on failure. `redact.ts` masks the `OPENROUTER_API_KEY` / `GITHUB_TOKEN` values and their first 8 characters.
    - **Owner:** implementer.

12. **[wave 2, after 1] Client data layer.**
    - **Files:** `client/src/lib/api.ts` (add `apiDownload(path, body) → Blob`), new `client/src/lib/hooks/ci.ts`, `client/src/lib/hooks/index.ts`.
    - **Implements:** AC-29, AC-35 (reuses `useUpdateAgent`), AC-70, AC-77, AC-91.
    - **Governed by:** `frontend-architecture`, `react-best-practices`, `next-best-practices`.
    - **Hooks:**
      - `useCiOverview(agentId)`;
      - `useCiRuns()`;
      - `useCiSecretsStatus(agentId, repoId)`;
      - `useCiPreview()`;
      - `useCiInstall()`;
      - `useCiZip()` (Blob → download);
      - `useCiRemove()`;
      - `useRefreshCi()`.
    - **Invalidation:** each mutation invalidates `["ci-overview", id]` and/or `["ci-runs"]`.
    - **Refetching:** every CI query sets `refetchOnWindowFocus: false` and no `refetchInterval` (AC-77, D-20).
    - **Owner:** implementer.

13. **[wave 2] Client strings: `client/messages/en/ci.json`.**
    - **Implements (copy):** AC-1, AC-2, AC-21, AC-22, AC-23, AC-31, AC-32, AC-50, AC-53, AC-73, AC-87, AC-88, AC-89, AC-91, AC-95, AC-98, AC-100, D-15, D-20.
    - **Governed by:** `frontend-architecture`.
    - **Remove:**
      - `runs.autoRefresh`;
      - the free-text repo keys;
      - the GitHub-App `blockMergeDesc`.
    - **Add, wizard:**
      - the repo picker;
      - the memory switch;
      - editable and read-only markers;
      - the slug / paths note;
      - the check-name note: "{checkName} can be marked required independently";
      - YAML error "line {line}", plus two warnings;
      - the regenerate-confirm dialog;
      - the secrets labels;
      - the AC-23 note;
      - the install options;
      - "branch {branch} exists" with an alternative;
      - the error format `{operation} failed (GitHub {status})`;
      - the runner-missing error naming `cd agent-runner && pnpm build`.
    - **Add, CI tab:**
      - "Active in {count} repos" and "no runs yet";
      - outdated and policy-changed markers, with "Update CI config";
      - "Remove from CI" with its confirm dialog;
      - "removal pending", "removed", and the "removed directly" message with the install PR link;
      - "Fail CI on".
    - **Add, CI Runs:**
      - columns and statuses: succeeded, failed, "skipped — secrets unavailable", result expired, rejected;
      - reason labels;
      - "partial" and "{count} skipped files";
      - filters;
      - the AC-53 empty state.
    - **Owner:** implementer.

#### Wave 3 — orchestration and client components (after wave 2)

14. **[wave 3, after 7-10] Export and removal orchestration.**
    - **Files:** `server/src/modules/ci/pipeline/export.ts`, `ci/pipeline/remove.ts`.
    - **Implements:** AC-3, AC-4, AC-7, AC-22, AC-25…AC-30, AC-58, AC-62, AC-63, AC-67, AC-68, AC-78, AC-81…AC-84, AC-87, AC-89, AC-91…AC-94, AC-98, AC-99, NFR-2, NFR-3 (export / remove entries), NFR-4.
    - **Governed by:**
      - `onion-architecture` (orchestration uses `CiDeps` ports only and imports no adapters; an `AppError` subclass is thrown for every failure);
      - `security`.
    - **Slug resolution** (shared by preview, install and zip):
      - if the agent has an existing non-removed installation for the repo → use its stored slug (AC-83);
      - otherwise allocate with `allocateSlug(slugify(agent.name) or the removed row's stored slug, taken)`.
      - `taken` = other agents' active or removal-pending slugs in the repo, plus each candidate slug whose `ciAgentDir` or `ciWorkflowPath` exists on the default branch (`pathExists`, AC-84).
      - **Adoption exception (A21, user-confirmed):** a candidate slug is **not** taken when no other installation holds it and `getFileText(ciManifestPath(candidate), defaultBranch)` passes `isSameAgentManifest(…, agent.id)`. The existing folder is then adopted: the first PR install uses that slug and updates (or syncs) those files in the install PR. If the candidate's workflow file also exists, it is updated as well.
      - A folder whose manifest belongs to a different agent, or has no or invalid identity, stays a collision (`-2`).
    - **Preliminary checks, before any GitHub write:**
      - the agent and repo are workspace-scoped (`NotFoundError` otherwise);
      - the bundle reader returns null → `ConfigError` naming `CI_RUNNER_BUILD_COMMAND` (AC-89);
      - an unparseable `workflow_yaml` → `ValidationError` with the line;
      - `containsSecret` → `ValidationError('export_contains_secret')`;
      - the installation is `removal_pending` → `ConflictError('ci_removal_pending')` (A20).
    - **Preview** returns `CiPreview`, including the slug, the paths and the check name.
    - **Secrets** come from `listActionsSecretNames` only; any error → `required`.
    - **Install:**
      1. Read the default branch and repo id with `getRepository`.
      2. Pick the branch: `input.branch` if it passes `isAllowedInstallBranch`, otherwise `ciInstallBranch(slug)`.
      3. Check `getBranchSha`:
         - the branch exists and `findOpenPr` finds a PR → commit on the branch head (fast-forward) and return the existing URL;
         - the branch exists with no open PR → `ConflictError('ci_branch_exists', { branch, suggested_branch })`, with no ref write;
         - the branch is missing → commit on the default head, `createRef`, then `openPullRequest` with the title and body from step 8.
      4. Compute `deletePaths` with `syncDeletes(listTreePaths(parent, ciAgentDir(slug)), newPaths)`.
      5. Every changed path must be under the agent folder or equal the agent's workflow path. Assert this before committing (AC-82).
      6. Each GitHub call is wrapped so a failure becomes `ExternalServiceError` with details `{ operation, github_status }`. Nothing is persisted on failure (AC-28).
      7. `upsertInstallation` with the slug, the workflow path, `status: active` and the PR fields.
    - **Zip** uses `zipSync` over the same file set. No GitHub write and no installation.
    - **Remove** (`installationId` must belong to the agent and be `active`, otherwise `ConflictError`):
      1. Run `planRemoval` over `listTreePaths(defaultHead, ciAgentDir(slug))` plus `getFileBlobSha(workflow_path, defaultHead)`.
      2. Nothing is present → `markRemoved` with no ref write. Return `removed_directly`, with `install_pr_url` when `getPullState` reports the install PR still open (AC-98).
      3. Otherwise use `isAllowedRemovalBranch(input.branch)`, or `ciRemovalBranch(slug)`:
         - the branch exists with an open PR → return that PR and set or keep `removal_pending` (AC-93);
         - the branch exists without a PR → `ConflictError('ci_branch_exists', { suggested_branch })` (AC-94);
         - the branch is missing → a deletion-only commit on the default head, `createRef`, then a PR titled "Remove DevDigest CI review: <name>". Then `setRemovalPending(removal PR fields)`.
      4. A GitHub failure → `ExternalServiceError`, and the status stays unchanged (AC-99).
      5. Deletions may only touch the agent's own paths (AC-92).
    - **Logging:** exactly one log entry per export or removal attempt: `{ event: 'ci.export' | 'ci.remove', agent_id, slug, repo, branch, outcome, github_status? }`, with no secrets.
    - **Owner:** implementer.

15. **[wave 3, after 7-10] Ingest orchestration: `server/src/modules/ci/pipeline/ingest.ts`.**
    - **Implements:** AC-43, AC-44…AC-48, AC-59 (PR state sync), AC-64, AC-69, AC-70, AC-74…AC-77, AC-80, AC-88, AC-90, AC-96, AC-97, NFR-3 (ingest entries), NFR-4.
    - **Governed by:** `onion-architecture`, `security` (fail closed; zip-bomb guard via the `fflate` `originalSize` filter before inflating).
    - **`refresh(workspaceId)`** reuses one in-flight promise per workspace. For each repo with pollable installations:
      1. Sync the install-PR state for installations whose `pr_state` is `open`.
      2. For each installation, run `listWorkflowRuns(repo, basename(workflow_path), 50)`. Re-check that each run's `path` equals `workflow_path`; a mismatch → `foreign_workflow`. Skip run keys that are already stored. Gather the artifact data and blob SHAs, call `ingest-validate`, then persist through `insertAcceptedRun` / `insertNonAcceptedRun`.
      3. Run one `listRepoWorkflowRuns(repo, 50)` scan. For runs whose `path` matches no pollable installation and that have a `devdigest-result*` artifact, log `foreign_workflow` once per run id (process-local seen set, A19). Nothing is stored.
      4. For `removal_pending` installations, read the removal PR state:
         - merged → after step 2 has ingested that installation's runs, `markRemoved` (AC-96);
         - closed unmerged → `reactivate` (AC-97).
    - **Failures:** one repo's GitHub failure goes into `errors[]` and does not abort the other repos.
    - **Logging:** exactly one log entry per ingest attempt: `{ event: 'ci.ingest', repo, repo_github_id, workflow_path, slug, pr_number, head_sha, workflow_run_id, run_attempt, outcome }`, where `outcome` is `accepted`, `failed`, `skipped`, `result_expired`, or a reason code.
    - **No LLM dependency** in `CiDeps`.
    - **Owner:** implementer.

16. **[wave 3, after 12-13] Shared CI runs table.**
    - **Files:** new `client/src/components/ci-runs/CiRunsTable/{index.ts,CiRunsTable.tsx,styles.ts,helpers.ts,constants.ts}`.
    - **Implements:** AC-34, AC-50, AC-51, AC-52, AC-54, AC-65, AC-73, AC-80, AC-88 (label), AC-100 (read-only), EC-20.
    - **Governed by:**
      - `frontend-architecture` (promoted to shared components: two routes use it);
      - `react-best-practices`;
      - `security` (plain text only; no `dangerouslySetInnerHTML` and no Markdown).
    - **`helpers.ts`:**
      - `safeRunUrl(url, repoFullName)` (exact regex, else null);
      - `filterRuns(runs, { period, agentId, repo, status }, now)`;
      - newest-first sort.
    - **Rendering rules:**
      - no row actions at all;
      - the link's `aria-label` includes the repo and the PR number (NFR-6).
    - **Owner:** implementer.

17. **[wave 3, after 12-13] CI Runs page and nav entry.**
    - **Files:**
      - new `client/src/app/ci-runs/page.tsx` (thin);
      - new `client/src/app/ci-runs/_components/CiRunsView/{index.ts,CiRunsView.tsx,styles.ts}`;
      - `client/src/vendor/ui/nav.ts` (add `ci-runs` → `/ci-runs` to SKILLS LAB after `eval`, with an existing `IconName`);
      - `client/src/vendor/ui/nav.test.ts` (update the pinned list).
    - **Implements:** AC-50, AC-53, AC-54, AC-70, AC-77.
    - **Governed by:** `frontend-architecture`, `next-best-practices`, `react-best-practices`.
    - **Behaviour:**
      - one `useRefreshCi().mutate()` on mount, with no timer;
      - a Refresh button;
      - filters in local state;
      - renders `CiRunsTable` (imported from `@/components/ci-runs/CiRunsTable`; built in parallel in step 16, so this step only depends on it at runtime);
      - AC-53 empty state.
    - **Owner:** implementer.

18. **[wave 3, after 12-13] Export to CI wizard.**
    - **Files:**
      - new `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportCiWizard/**`:
        - `ExportCiWizard.tsx`, `index.ts`, `styles.ts`, `constants.ts`;
        - `helpers.ts` (`lintWorkflowYaml` via `yaml.parseDocument`, `canInstall`, `canContinueConfigure`);
        - `useExportWizard.ts` (a `useReducer`);
        - `_components/{TargetStep,PreviewStep,ConfigureStep,InstallStep}/`;
      - `client/src/vendor/ui/ExportWizardSteps.tsx` (`aria-current="step"`; the Showcase entry already exists).
    - **Implements:** AC-1…AC-4, AC-6, AC-7, AC-20…AC-25, AC-28, AC-29, AC-55…AC-58, AC-62, AC-63, AC-67, AC-68, AC-84 (shows the suffixed paths), AC-87 (check name on Configure), AC-89 (shows the error), NFR-6 (SHOULD).
    - **Governed by:**
      - `frontend-architecture`;
      - `react-best-practices` (reducer state; regeneration happens in event handlers, not effects);
      - `next-best-practices`;
      - `security`.
    - **Target step:**
      - GitHub Actions is the only radio, preselected, with the "recommended" badge;
      - the repo comes from a `SelectInput` fed by `useRepos()`, with no free text.
    - **Preview step:**
      - the file list comes from the server, showing the slug and its paths;
      - only the workflow is editable;
      - the runner entry shows only its size and sha (A11);
      - the memory `Toggle` is off by default and re-requests the preview;
      - memory content is shown read-only.
    - **Configure step:**
      - trigger chips: opened and synchronize on, reopened off;
      - Continue is disabled when no trigger is selected;
      - 3 post options, with `github_review` as default;
      - the secrets rows;
      - the AC-23 note;
      - the check name with the "independently" note.
      - A change regenerates the workflow from the server preview; if `workflowEdited`, a `ConfirmDialog` asks first, and declining keeps the edit.
    - **Install step:**
      - PR or "Download .zip";
      - a YAML parse error disables Install and shows the line; warnings keep Install enabled;
      - on success, the PR link is shown;
      - on 409 `ci_branch_exists`, offer "Install on `<suggested>`";
      - other errors show `{operation} failed (GitHub {status})` and keep all state.
    - **Focus:** focus moves in on open, Escape closes the wizard, and focus returns to the opener. This is handled inside the wizard; the shared `Modal` is not modified.
    - **Owner:** implementer.

19. **[wave 3, after 11] test-writer: runner behaviour tests.**
    - **Files:** new `agent-runner/src/skip.test.ts`, `diff-cap.test.ts`, `artifact.test.ts`, `agent-folder.test.ts`, `run-ci.test.ts`.
    - **Tests:** AC-14, AC-37…AC-41, AC-60, AC-71, AC-72, AC-79, AC-85, EC-19, EC-34, EC-35.
    - **Cases** (from the spec's Verify hints):
      - **Skip:** a fork payload, and a `dependabot[bot]` actor with no key → exit 0, no LLM call, no POST, and the notice says "review did not run".
      - **Grounding and gate:**
        - one grounded + one ungrounded finding → only the grounded one is kept;
        - `critical` with a CRITICAL finding when the model says "approve" → REQUEST_CHANGES and exit 1.
      - **Posting:**
        - each post method sends the right POST (or none);
        - the inline-comment 422 falls back to a body-only post.
      - **Failure:** empty key + a sentinel token → exit 1, no POST, no artifact, and the log line contains neither the sentinel nor its first 8 characters.
      - **Diff filtering (AC-60):** the 5-path diff for agent `a`.
      - **Diff cap:**
        - the AC-71 fixture, with the env unset and with `DEVDIGEST_MAX_DIFF_LINES=1000`;
        - AC-79 with `abc` and `-5`;
        - AC-72 with `[x](https://evil.test).js`, which must render as code, never a link, in both the comment and the summary.
      - **Artifact:** the AC-41 key-set equality.
      - **Agent folder (AC-85):** `.devdigest/agents/a/` and `.devdigest/agents/b/` exist → only `a` is read (fs spy).
    - **Governed by:** `agent-runner/CLAUDE.md` (hermetic, LLM stubbed), `typescript-expert`.
    - **Owner:** test-writer.

20. **[wave 3, after 8-9] test-writer: server pure-ring unit tests.**
    - **Files:** `server/test/ci-manifest.test.ts`, `server/test/ci-ingest-validate.test.ts`, `server/test/ci-helpers.test.ts`, `server/test/ci-lifecycle.test.ts`.
    - **Tests:**
      - AC-4 (composition), AC-5 (including `studio_agent_id`), AC-82 (`syncDeletes` scoped to the agent folder);
      - `isSameAgentManifest`: same id → true; another id, missing id, or invalid YAML → false (A21);
      - AC-84 (`allocateSlug`);
      - AC-26 / AC-92 (branch validators);
      - AC-51 (`buildRunUrl`);
      - AC-44…AC-46, AC-64, AC-74, AC-75, AC-88 (the decision table, including "API base SHA wins" and "an artifact claiming skipped is not skipped");
      - AC-96…AC-98 (lifecycle);
      - EC-7;
      - NFR-2 (`containsSecret`).
    - **Governed by:** `onion-architecture` (`rules/testing.md`), `zod`.
    - **Owner:** test-writer.

#### Wave 4 — service facade, routes and wiring; CI tab (after wave 3)

21. **[wave 4, after 14-15] CI service, routes, registration and composition root.**
    - **Files:**
      - `server/src/modules/ci/service.ts` (facade over `pipeline/export.ts`, `remove.ts` and `ingest.ts`, plus the read models);
      - `ci/routes.ts`;
      - `server/src/modules/index.ts`;
      - `server/src/platform/container.ts`;
      - `server/src/platform/config.ts` (`AGENT_RUNNER_BUNDLE`, default `<repoRoot>/agent-runner/dist/index.js`).
    - **Implements:** wiring for every server AC above, AC-34, AC-43 (no result-accepting route), AC-59 (overview count), AC-100 (empty action list for removed installations), AC-89.
    - **Governed by:**
      - `onion-architecture` (validate → one service call → return; the service takes `CiDeps`);
      - `fastify-best-practices` (Zod schemas on params, query and body; the zip route sets `application/zip` + `content-disposition`);
      - `zod`, `security`.
    - **Routes:**

      | Method | Path | Request → response |
      |---|---|---|
      | POST | `/agents/:id/ci/preview` | `CiPreviewInput` → `CiPreview` |
      | GET | `/agents/:id/ci/secrets?repo_id` | → `CiSecretsStatus` |
      | POST | `/agents/:id/ci/install` | `CiInstallInput` → `CiInstallResult` |
      | POST | `/agents/:id/ci/zip` | → zip bytes |
      | POST | `/agents/:id/ci/installations/:installationId/remove` | nullish `CiRemoveInput` → `CiRemoveResult` |
      | GET | `/agents/:id/ci` | → `CiAgentOverview` |
      | GET | `/ci/runs` | → `CiRun[]` |
      | POST | `/ci/refresh` | nullish body → `CiRefreshResult` |

      No route accepts a result body.
    - **Container:**
      - a `ciService` singleton (it owns the refresh guard);
      - `githubCi()` (`overrides.githubCi` or the same `OctokitGitHubClient` built from `SecretsProvider` `GITHUB_TOKEN`);
      - `readRunnerBundle` (`fs.readFile` of the config path, ENOENT → null);
      - `studioSecretValues`;
      - `agents: this.agentsRepo`;
      - `logger: console`.
      - `ContainerOverrides` gains `githubCi?` and `runnerBundle?`.
    - **Owner:** implementer.

22. **[wave 4, after 16, 18] Agent CI tab with removal, and editor wiring.**
    - **Files:**
      - new `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/{index.ts,CiTab.tsx,styles.ts,helpers.ts}`;
      - `AgentEditor/AgentEditor.tsx`;
      - `AgentEditor/constants.ts` (the `ci` tab);
      - `client/src/app/agents/[id]/page.tsx` (`VALID_TABS += "ci"`).
    - **Implements:** AC-1, AC-31…AC-36, AC-59, AC-70, AC-73, AC-91 (action), AC-93 / AC-94 (alternative offer), AC-95, AC-97 (offers removal again), AC-98 (message), AC-99 (error), AC-100.
    - **Governed by:** `frontend-architecture`, `react-best-practices`, `next-best-practices`.
    - **Tab contents:**
      - "Active in N repos";
      - one row per installation: repo, "GitHub Actions", `v{version}`, slug / check name, the latest run's status and relative time (or "no runs yet"), and the status;
      - an empty state with "Add to CI";
      - a "Fail CI on" select wired through `useUpdateAgent`;
      - Refresh;
      - history in `CiRunsTable`.
    - **Per-row state:**
      - outdated and policy-changed markers come from `helpers.ts`;
      - an `active` row offers "Update CI config" (opens the wizard prefilled) and "Remove from CI" (confirmation first);
      - a `removal_pending` row shows the label and the removal-PR link, with no Remove and no Update (AC-95, A20);
      - a `removed` row shows the label and no actions (AC-100).
    - **Removal feedback:**
      - 409 `ci_branch_exists` → offer the suggested branch;
      - `removed_directly` → a message with the install-PR link.
    - **Owner:** implementer.

#### Wave 5 — integration and client tests (after wave 4)

23. **[wave 5, after 21] test-writer: export and removal integration tests.**
    - **Files:** `server/test/ci-export.it.test.ts`, `server/test/ci-remove.it.test.ts`.
    - **Setup:** Testcontainers; `MockGitHubClient` as both `github` and `githubCi`; a fake runner bundle.
    - **Tests:** AC-4, AC-22, AC-25…AC-30, AC-58, AC-63, AC-67, AC-68, AC-78, AC-81…AC-84, AC-87, AC-89, AC-91…AC-94, AC-98, AC-99, NFR-2, NFR-3 (export / remove entries), NFR-4.
    - **Cases** (from the Verify hints):
      - **Fresh install:**
        - default branch `trunk` and "Security Reviewer" → `devdigest/ci-security-reviewer` and the titled PR;
        - the PR body contains the fork / Dependabot statement, the check name and "independently".
      - **Re-export and branch rules:**
        - re-export with an open PR → a new commit on the branch and the same URL;
        - the branch exists without a PR → the suggestion; accepting it produces a new PR;
        - every ref write has `force` set to false.
      - **Failures and zip:**
        - 403 on the commit → the error names the operation and 403, no installation is written, and a retry with the same body succeeds;
        - the zip equals the preview, makes no write calls and adds no installation.
      - **Secrets:** `set`, `not_set`, and `required` on a 403, using only the list endpoint.
      - **Privacy and cost:**
        - the sentinel secret values never appear in the export;
        - the memory bytes in the preview equal the committed bytes;
        - the counting LLM mock records 0 calls.
      - **Multi-agent (AC-81, AC-82):** a second agent touches only its own paths and branch, and a re-export with memory off deletes only `a/memory.jsonl`.
      - **Slugs:**
        - a rename keeps the slug (AC-83);
        - an existing `devdigest-review-security-reviewer.yml` → `-2` (AC-84).
      - **Folder adoption (A21):**
        - the default branch already holds `.devdigest/agents/security-reviewer/manifest.yaml` with this agent's `studio_agent_id` (an earlier zip install) and there is no installation row → Preview lists the `security-reviewer` paths (no suffix), the install PR updates those files, and the installation stores `security-reviewer`;
        - the same folder with another agent's id → `security-reviewer-2`;
        - the same folder with no id → `security-reviewer-2`.
      - **Missing bundle (AC-89):** preview and install both return the build-command error, with zero writes and zero rows.
      - **Removal:**
        - the removal commit deletes exactly the agent's paths and leaves `b` untouched;
        - an existing open removal PR is reused;
        - an existing removal branch without a PR → the suggestion;
        - both paths absent with the install PR open → `removed` directly, with the link;
        - only the workflow present → the PR deletes just that file;
        - a 403 on removal leaves the installation status unchanged.
      - **Logging:** one log entry per attempt.
    - **Governed by:** `onion-architecture` (`rules/testing.md`), `fastify-best-practices` (`app.inject`).
    - **Owner:** test-writer.

24. **[wave 5, after 21] test-writer: ingest, lifecycle and isolation integration tests.**
    - **Files:** `server/test/ci-ingest.it.test.ts`, `server/test/ci-isolation.it.test.ts`.
    - **Tests:** AC-34, AC-43…AC-49, AC-59, AC-64…AC-66, AC-69, AC-70, AC-74…AC-77, AC-80, AC-88, AC-90, AC-96, AC-97, AC-100, EC-12, EC-24, NFR-3 (one ingest entry per outcome / reason).
    - **Cases** (from the Verify hints):
      - **Basic ingest:**
        - 2 completed runs (1 already ingested) + 1 in progress → 1 new row;
        - re-ingesting attempts 1, 1, 2 → 2 rows.
      - **Foreign workflows and attribution:**
        - runs of `other.yml` and of an uninstalled `devdigest-review-x.yml` → 2 `foreign_workflow` logs and no rows;
        - a `b`-workflow run whose artifact claims `a` → attributed to `b` (AC-90).
      - **Rejections:**
        - 1,048,577 bytes / a missing SHA / a string count → `too_large` / `schema`;
        - repo id 222 vs 111 → `repository_mismatch`;
        - SHA `bbb` vs `aaa` → `sha_mismatch`;
        - the AC-74 blob cases;
        - a disabled agent → `agent_inactive`;
        - a `workflow_modified` run is listed once across two refreshes.
      - **No-artifact statuses:**
        - a fork, a Dependabot run and a human same-repo run with no artifact → `skipped`, `skipped`, `failed`, and an artifact cannot relabel a run as `skipped`;
        - an expired artifact → `result_expired`.
      - **Accepted runs:** a valid run → an `agent_runs` row with `source='ci'`, `pr_id` null and `done`.
      - **Removal lifecycle:**
        - a merged removal PR with 1 pending run → the run is ingested, then the installation becomes `removed`;
        - a removal PR closed unmerged → `active` again.
      - **Active-repos count (AC-59):** merged / open-with-run / closed, plus another agent → N = 2; after a removal → N = 1.
      - **Removed history (AC-100):** a removed installation still lists its 2 runs read-only.
      - **Agent deletion (AC-65):** deleting the agent keeps the runs and their names.
      - **Push endpoint (AC-43):** no route accepts a result body.
      - **PR-feed isolation:** a PR cost of 0.01 stays 0.01 after a 0.05 CI run, and the PR run list still has 1 entry.
      - **Agent list (AC-66):** 2 runs with avg 0.02 are unchanged by a CI run.
      - **Overview:** shows only that agent's runs, newest first.
      - **AC-77:** no timer.
    - **Governed by:** `onion-architecture` (`rules/testing.md`), `drizzle-orm-patterns`.
    - **Owner:** test-writer.

25. **[wave 5, after 16-18, 22] test-writer: client component tests.**
    - **Files:**
      - `ExportCiWizard/ExportCiWizard.test.tsx`;
      - `ExportCiWizard/helpers.test.ts`;
      - `CiTab/CiTab.test.tsx`;
      - `client/src/components/ci-runs/CiRunsTable/CiRunsTable.test.tsx`;
      - `client/src/app/ci-runs/_components/CiRunsView/CiRunsView.test.tsx`.
    - **Tests:** AC-1, AC-2, AC-3, AC-6, AC-7, AC-20, AC-21, AC-23, AC-24, AC-31…AC-33, AC-35, AC-36, AC-50…AC-57, AC-62, AC-73, AC-77 (client side), AC-95, AC-97 (Remove offered again), AC-100 (no actions).
    - **Wizard cases:**
      - step labels and order;
      - only GitHub Actions is offered;
      - the picker shows exactly workspace repos A and B, and Install is disabled until one is picked;
      - only the workflow is editable;
      - edit → Back → forward → zip keeps the edit;
      - chip states and the disabled Continue;
      - 3 radios, with the first checked;
      - the AC-23 note;
      - regeneration when unedited;
      - confirm / decline / accept;
      - a bad indent on line 7 → disabled Install and the line number;
      - permissions and `pull_request_target` warnings;
      - the memory switch.
    - **CI tab cases:**
      - two installations, one with no runs;
      - the empty state;
      - the outdated marker opens the prefilled wizard;
      - "Fail CI on" sends `ci_fail_on`, and ConfigTab shows the same value;
      - the policy-changed marker;
      - `removal_pending` → the label, the PR link and no Remove;
      - `removed` → no actions.
    - **CI Runs table cases:**
      - the columns and newest-first order;
      - `javascript:` and foreign-repo URLs render no anchor;
      - an `<img onerror>` name renders as text;
      - the empty state;
      - each filter;
      - "partial" and "2 skipped files";
      - the "skipped — secrets unavailable" label.
    - **CI Runs view cases:** one refresh on mount, and none after advancing fake timers.
    - **Method:** `fireEvent`, with mocks at `@/lib/hooks/ci`.
    - **Governed by:** `react-testing-library` + `frontend-architecture`.
    - **Owner:** test-writer.

### File ownership (per wave)

| Wave | Step | Files owned |
|---|---|---|
| 1 | 1 | `server/src/vendor/shared/contracts/eval-ci.ts`, `client/src/vendor/shared/contracts/eval-ci.ts`, `server/src/vendor/shared/adapters.ts`, `client/src/vendor/shared/adapters.ts` |
| 1 | 2 | `server/package.json`, `server/pnpm-lock.yaml`, `client/package.json`, `client/pnpm-lock.yaml` |
| 1 | 3 | `server/src/db/schema/ci.ts`, `server/src/db/migrations/0022_*.sql`, `server/src/db/migrations/meta/*` |
| 1 | 4 | `server/test/ci-workflow.test.ts` |
| 1 | 5 | `agent-runner/src/diff.ts`, `agent-runner/src/diff-cap.ts`, `agent-runner/src/diff.test.ts` |
| 1 | 6 | `server/src/modules/agents/repository.ts`, `server/src/modules/skills/repository.ts` |
| 2 | 7 | `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts` |
| 2 | 8 | `server/src/modules/ci/{types,constants,helpers}.ts` |
| 2 | 9 | `server/src/modules/ci/pipeline/{workflow,manifest,ingest-validate,lifecycle}.ts` |
| 2 | 10 | `server/src/modules/ci/repository.ts` |
| 2 | 11 | `agent-runner/src/{context,manifest,skills,artifact,run,index,skip,summary,memory,redact}.ts`, `agent-runner/src/{manifest,run}.test.ts` (fixture paths only), `agent-runner/README.md` |
| 2 | 12 | `client/src/lib/api.ts`, `client/src/lib/hooks/ci.ts`, `client/src/lib/hooks/index.ts` |
| 2 | 13 | `client/messages/en/ci.json` |
| 3 | 14 | `server/src/modules/ci/pipeline/{export,remove}.ts` |
| 3 | 15 | `server/src/modules/ci/pipeline/ingest.ts` |
| 3 | 16 | `client/src/components/ci-runs/CiRunsTable/**` (non-test) |
| 3 | 17 | `client/src/app/ci-runs/**` (non-test), `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/nav.test.ts` |
| 3 | 18 | `.../CiTab/_components/ExportCiWizard/**` (non-test), `client/src/vendor/ui/ExportWizardSteps.tsx` |
| 3 | 19 | `agent-runner/src/{skip,diff-cap,artifact,agent-folder,run-ci}.test.ts` |
| 3 | 20 | `server/test/ci-{manifest,ingest-validate,helpers,lifecycle}.test.ts` |
| 4 | 21 | `server/src/modules/ci/{service,routes}.ts`, `server/src/modules/index.ts`, `server/src/platform/container.ts`, `server/src/platform/config.ts` |
| 4 | 22 | `.../CiTab/{index.ts,CiTab.tsx,styles.ts,helpers.ts}`, `AgentEditor/AgentEditor.tsx`, `AgentEditor/constants.ts`, `client/src/app/agents/[id]/page.tsx` |
| 5 | 23 | `server/test/ci-export.it.test.ts`, `server/test/ci-remove.it.test.ts` |
| 5 | 24 | `server/test/ci-ingest.it.test.ts`, `server/test/ci-isolation.it.test.ts` |
| 5 | 25 | `ExportCiWizard/*.test.ts(x)`, `CiTab/CiTab.test.tsx`, `CiRunsTable/CiRunsTable.test.tsx`, `CiRunsView/CiRunsView.test.tsx` |

Notes:
- `.../CiTab/` = `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/`.
- Steps 18 and 22 share the `CiTab/` folder but no files. They are also in different waves.
- All cross-package contract changes are in step 1.

### Spec coverage

| ID | Priority | Step(s) | Test owner |
|---|---|---|---|
| AC-1 | MUST | 18, 22 | test-writer 25 |
| AC-2 | MUST | 18 | test-writer 25 |
| AC-3 | MUST | 10, 14, 18 | test-writer 25 |
| AC-4 | MUST | 9, 14, 18 | test-writer 20, 23 |
| AC-5 | MUST | 9 | test-writer 20 |
| AC-6 | MUST | 18 | test-writer 25 |
| AC-7 | MUST | 14, 18 | test-writer 25 |
| AC-8 | MUST | 9 | test-writer 4 |
| AC-9 | MUST | 9 | test-writer 4 |
| AC-10 | MUST | 9 | test-writer 4 |
| AC-11 | MUST | 8, 9 | test-writer 4 |
| AC-12 | MUST | 9, 11 | test-writer 4 |
| AC-13 | MUST | 9 | test-writer 4 |
| AC-14 | MUST | 11 | test-writer 19 |
| AC-15 | MUST | 9 | test-writer 4 |
| AC-16 | SHOULD | 9 | test-writer 4 |
| AC-17 | MUST | 9, 11 | manual e2e (spec Verify); step 4 asserts the base-SHA checkout |
| AC-18 | MUST | 9, 11 | test-writer 4, 19 |
| AC-19 | MUST | 9 | test-writer 4; manual e2e |
| AC-20 | MUST | 18 | test-writer 25 |
| AC-21 | MUST | 18 | test-writer 25 |
| AC-22 | MUST | 7, 14, 18 | test-writer 23 |
| AC-23 | MUST | 13, 18 | test-writer 25 |
| AC-24 | MUST | 9, 18 | test-writer 4, 25 |
| AC-25 | MUST | 8, 14, 18 | test-writer 23 |
| AC-26 | MUST | 7, 8, 14 | test-writer 20, 23 |
| AC-27 | MUST | 7, 14 | test-writer 23 |
| AC-28 | MUST | 7, 14, 18 | test-writer 23 |
| AC-29 | MUST | 12, 14, 18 | test-writer 23 |
| AC-30 | MUST | 3, 10, 14 | test-writer 23 |
| AC-31 | MUST | 10, 22 | test-writer 25 |
| AC-32 | MUST | 22 | test-writer 25 |
| AC-33 | SHOULD | 22 | test-writer 25 |
| AC-34 | MUST | 10, 21, 22 | test-writer 24 |
| AC-35 | MUST | 22 | test-writer 25 |
| AC-36 | SHOULD | 3, 22 | test-writer 25 |
| AC-37 | MUST | 11 | test-writer 19 |
| AC-38 | MUST | 11 | test-writer 19 |
| AC-39 | MUST | 11 | test-writer 19 |
| AC-40 | MUST | 11 | test-writer 19 |
| AC-41 | MUST | 1, 11 | test-writer 19 |
| AC-42 | MUST | 9, 11 | manual e2e (spec Verify); redaction in test-writer 19 |
| AC-43 | MUST | 15, 21 | test-writer 24 |
| AC-44 | MUST | 1, 9, 15 | test-writer 20, 24 |
| AC-45 | MUST | 9, 15 | test-writer 20, 24 |
| AC-46 | MUST | 9, 15 | test-writer 20, 24 |
| AC-47 | MUST | 10, 15 | test-writer 24 |
| AC-48 | MUST | 3, 10 | test-writer 24 |
| AC-49 | MUST | 6, 10 | test-writer 24 |
| AC-50 | MUST | 16, 17 | test-writer 25 |
| AC-51 | MUST | 8, 10, 16 | test-writer 20, 25 |
| AC-52 | MUST | 16 | test-writer 25 |
| AC-53 | MUST | 13, 17 | test-writer 25 |
| AC-54 | SHOULD | 16, 17 | test-writer 25 |
| AC-55 | MUST | 18 | test-writer 25 |
| AC-56 | MUST | 18 (+9 server 422) | test-writer 25 |
| AC-57 | MUST | 18 | test-writer 25 |
| AC-58 | MUST | 8, 14, 18 | test-writer 23 |
| AC-59 | MUST | 8, 10, 15, 21, 22 | test-writer 24 |
| AC-60 | MUST | 5, 11 | test-writer 19 |
| AC-61 | MUST | 9 | test-writer 4 |
| AC-62 | MUST | 9, 14, 18 | test-writer 23, 25 |
| AC-63 | MUST | 9, 10, 18 | test-writer 23 |
| AC-64 | MUST | 9, 15 | test-writer 20, 24 |
| AC-65 | MUST | 3, 10, 16 | test-writer 24, 25 |
| AC-66 | MUST | 6 | test-writer 24 |
| AC-67 | MUST | 7, 8, 14 | test-writer 23 |
| AC-68 | MUST | 14 | test-writer 23 |
| AC-69 | MUST | 9, 15 | test-writer 24 |
| AC-70 | MUST | 12, 15, 17, 22 | test-writer 24 |
| AC-71 | MUST | 5, 9 | test-writer 19 |
| AC-72 | MUST | 11 | test-writer 19 |
| AC-73 | MUST | 10, 16, 22 | test-writer 25 |
| AC-74 | MUST | 7, 9, 15 | test-writer 20, 24 |
| AC-75 | SHOULD | 9, 15 | test-writer 20, 24 |
| AC-76 | SHOULD | 9, 15 | test-writer 24 |
| AC-77 | SHOULD | 12, 15, 17 | test-writer 24, 25 |
| AC-78 | MUST | 8, 14 | test-writer 23 |
| AC-79 | MUST | 5 | test-writer 19 |
| AC-80 | MUST | 9, 10, 15, 16 | test-writer 24 |
| AC-81 | MUST | 7, 14 | test-writer 23 |
| AC-82 | MUST | 9, 14 | test-writer 20, 23 |
| AC-83 | MUST | 3, 10, 14 | test-writer 23 |
| AC-84 | MUST | 3, 8, 14, 18 | test-writer 20, 23 |
| AC-85 | MUST | 11 | test-writer 19 |
| AC-86 | MUST | 9 | test-writer 4 |
| AC-87 | MUST | 8, 14, 18 | test-writer 23 |
| AC-88 | MUST | 7, 9, 15, 16 | test-writer 20, 24 |
| AC-89 | MUST | 14, 21, 18 | test-writer 23 |
| AC-90 | MUST | 9, 15 | test-writer 24 |
| AC-91 | MUST | 9, 14, 22 | test-writer 23 |
| AC-92 | MUST | 8, 14 | test-writer 20, 23 |
| AC-93 | MUST | 14, 22 | test-writer 23 |
| AC-94 | MUST | 14, 22 | test-writer 23 |
| AC-95 | MUST | 22 | test-writer 25 |
| AC-96 | MUST | 9, 15 | test-writer 20, 24 |
| AC-97 | MUST | 9, 15, 22 | test-writer 24, 25 |
| AC-98 | MUST | 9, 14, 22 | test-writer 20, 23 |
| AC-99 | MUST | 14, 22 | test-writer 23 |
| AC-100 | MUST | 10, 16, 21, 22 | test-writer 24, 25 |
| EC-1, EC-2, EC-32 | — | 8, 11 | test-writer 19, 23 |
| EC-3 | — | 11 | test-writer 19 |
| EC-4, EC-5, EC-6 | — | 7, 14 | test-writer 23 |
| EC-7 | — | 9 | test-writer 20 |
| EC-8, EC-9 | — | 9, 10 | test-writer 4, 24 |
| EC-10, EC-11 | — | 9 | test-writer 20, 24 |
| EC-12, EC-24 | — | 10 | test-writer 24 |
| EC-13 | — | 9 | test-writer 4; manual e2e |
| EC-14 | — | 9, 11 | manual e2e |
| EC-15, EC-40, EC-41 | — | 5, 15 | test-writer 19, 24 |
| EC-16, EC-17 | — | 18 | test-writer 25 |
| EC-18 | — | 9, 14, 18 | test-writer 23, 25 |
| EC-19, EC-20 | — | 11, 16 | test-writer 19, 25 |
| EC-21, EC-22, EC-44 | — | 9, 15 | test-writer 24 |
| EC-23, EC-42 | — | 3 (cascade), 15 | test-writer 24 |
| EC-25, EC-27, EC-31, EC-33, EC-36 | — | 9, 15 | test-writer 20, 24 |
| EC-26 | — | 14 | test-writer 23 |
| EC-28, EC-54 | — | 8, 10 | test-writer 24 |
| EC-29, EC-30, EC-34, EC-35 | — | 5, 11 | test-writer 19 |
| EC-37, EC-43 | — | 9 | test-writer 4 |
| EC-38, EC-39, EC-53 | — | 8, 14 | test-writer 20, 23 |
| EC-45 | — | 14 | test-writer 23 |
| EC-46, EC-47 | — | 14 | test-writer 23 |
| EC-48, EC-52 | — | 9, 15 | test-writer 24 |
| EC-49, EC-50, EC-51 | — | 9, 14 | test-writer 23 |
| NFR-1 | MUST | 9 | test-writer 4 |
| NFR-2 | MUST | 8, 14 | test-writer 20, 23 |
| NFR-3 | MUST | 14, 15 | test-writer 23, 24 |
| NFR-4 | MUST | 11, 14, 15 | test-writer 19, 23 |
| NFR-5 | MUST | 1 | `check-vendor-shared-sync.sh` (via verify-changed) |
| NFR-6 | SHOULD | 16, 18 | manual (spec Verify) |

Every MUST criterion has at least one implementing step and a test owner. AC-17, AC-19 and AC-42 also keep their spec-mandated manual e2e check on a real GitHub repository.

### Skills the implementer will invoke

Routing per `.claude/skills/pr-self-review/SKILL.md` Phase 4 (loaded live, not copied):

| Files | Steps | Skills |
|---|---|---|
| `server/src/{modules/ci/**,adapters/github/*,adapters/mocks.ts,platform/*,db/**}`, `modules/{agents,skills}/repository.ts` | 3, 6–10, 14, 15, 21 | `onion-architecture` |
| `ci/routes.ts`, `modules/index.ts` | 21 | + `fastify-best-practices` |
| `ci/repository.ts`, `agents/repository.ts`, `skills/repository.ts`, `db/**` | 3, 6, 10 | + `drizzle-orm-patterns` |
| `db/schema/ci.ts`, the migration | 3 | + `postgresql-table-design` (also the Phase-3 migration gate) |
| `vendor/shared/**` and every `zod` importer | 1, 9, 10, 14, 15, 18, 21 | `zod` |
| `client/src/**` outside `vendor` | 12, 16–18, 22 | `frontend-architecture`, `react-best-practices`, `next-best-practices` |
| `client/src/vendor/ui/{nav.ts,nav.test.ts,ExportWizardSteps.tsx}` | 17, 18 | `frontend-architecture` |
| Client tests | 17, 25 | `react-testing-library` + `frontend-architecture` |
| `client/messages/en/ci.json` | 13 | i18n key-parity check (no skill) |
| Every changed `*.ts` / `*.tsx`, including `agent-runner/src/**` | all | `typescript-expert`, `security` |
| `agent-runner/**` | 5, 11, 19 | no Phase-4 row; follow `agent-runner/CLAUDE.md` and `insights/INSIGHTS.md` |

### Verification scope

**After each wave**
- Run `bash scripts/verify-changed.sh`. It covers typecheck, `vitest related`, `pnpm arch:check`, and `check-vendor-shared-sync.sh` when wave 1 is touched.
- Run `cd agent-runner && pnpm typecheck && pnpm test`; this package is not covered by the script.
- Wave 1 is expected red only for `ci-workflow.test.ts`.

**After step 3**
- `cd server && pnpm db:generate`, then read the SQL.
- `pnpm db:migrate` on the dev DB.
- `git ls-files --eol` on the vendored files.

**After wave 5** (integration lane; needs Docker; check `skipped` = 0):
`cd server && pnpm exec vitest run test/ci-export.it.test.ts test/ci-remove.it.test.ts test/ci-ingest.it.test.ts test/ci-isolation.it.test.ts test/agents-stats.it.test.ts test/pulls-list.it.test.ts test/skills.it.test.ts`.

**Once at the end**
- `bash scripts/verify-changed.sh --full` (server unit + client suites).
- `cd agent-runner && pnpm build`, then confirm `dist/index.js` has zero top-level `import` / `require`.

**Manual** (spec e2e for AC-17, AC-19 and AC-42; NFR-6), on a demo repo:
- install two agents;
- a same-repo PR that sets `ci_fail_on: never` in one agent's manifest and adds a CRITICAL issue → that agent's check stays red;
- the `devdigest-result-<slug>` artifact exists on a red run;
- the logs and artifacts contain no key or token, and not their first 8 characters;
- remove one agent through its removal PR, and confirm the other keeps running;
- a keyboard and screen-reader pass over the wizard and CI Runs.

Do not run the full e2e suite or unrelated packages.

### Explicitly out of scope

**For `security-reviewer`:**
- the sufficiency of the `workflow_modified` blob check plus the API base SHA, and the residual risk from base-branch writers;
- the studio token scopes (`workflow`, Actions-secret metadata read, Actions read);
- the zip-bomb and size-guard design;
- whether a repo writer can plant a folder whose manifest claims an agent's `studio_agent_id`, so that the agent's first PR install adopts it (A21). The resulting install PR is still human-reviewed;
- whether the `DEVDIGEST_AGENT_SLUG` env in the editable workflow can be abused. Attribution relies only on the API path, but the env selects which folder the runner loads.

**For `architecture-reviewer`:**
- the second port (`GitHubCiClient`);
- `ci_runs` duplicating display metrics that `agent_runs` also stores;
- `pr_id = NULL` as the isolation mechanism;
- the repository-internal transaction;
- orchestration in `ci/pipeline/*` behind a service facade;
- the server reading `../agent-runner/dist/index.js`.

**For `doc-writer`:**
- the README / D-18 documentation;
- the root `AGENTS.md` row for `agent-runner/`;
- feature docs.

**Not planned here:**
- a Phase-4 routing row, a CI workflow, or a `verify-changed.sh` entry for `agent-runner/`;
- every spec non-goal;
- a shared `Modal` focus trap.

### Open questions / assumptions

**Questions for the user:** none remain.
- Q1–Q4 were answered for revision 2 and are now in the spec.
- Q5 (→ A20) and Q7 (→ A19) were confirmed by the user.
- Q6 was answered by the user with a different rule from my default; it is now A21.

**Assumptions.** Items marked *user-confirmed* are settled; the rest are vetoable. A1, A2 and A18's main case are superseded by D-27, D-28 and EC-23 / EC-42. A6 and A13 are narrowed.

- **A3.** An artifact whose `workflow_run_id`, `workflow_run_attempt` or `pr_number` differs from the API data of the run it came from is rejected as `sha_mismatch`.
- **A4.** AC-71 ordering: changed lines descending, then bytes descending, then path ascending. Both caps apply to the cumulative sums.
- **A5.** Memory export:
  - which rows: `memory` rows with scope `global` / `team`, plus scope `repo` for the target repo, ordered by `created_at, id`;
  - line format: `{"kind","scope","content"}`;
  - use: the runner passes the content as reviewer-core `memory`.
- **A6.** A re-export syncs the whole agent folder: any stale file under `.devdigest/agents/<slug>/` (memory, unlinked skills) is deleted in the same commit. AC-82 allows this and requires it for memory.
- **A7.** The skills pull-rate query also filters `source='local'` (D-13).
- **A8.** A non-OpenRouter agent is exported unchanged. A wrong model id fails the CI run through the AC-40 path. No UI warning is shown.
- **A9.** Real full-length SHAs for `actions/checkout`, `setup-node` and `upload-artifact` v4 are looked up (e.g. `git ls-remote`) and recorded with their tag. They are never invented.
- **A10.** Node 22 via `setup-node` lets the ESM runner run without a `package.json` next to it. The manual e2e run must confirm this. If it fails, the fallback (an extra `runner/package.json` in the agent folder) is allowed by AC-82 but changes AC-4's file list, so it needs a spec note.
- **A11.** The preview returns the runner as `contents: null` with its size and sha256. The PR and the zip contain the real bytes, and the tests compare sha256.
- **A12.** The runner bundle is committed through `createBlob` (base64).
- **A13.** Agent slugs follow AC-84. Skill files inside an agent folder are named `slugify(skill.name)`, with `-2` / `-3` suffixes for collisions within that agent.
- **A14.** The AC-74 base SHA comes from `workflow_run.pull_requests[].base.sha` for the run's PR. If there is none, the run is rejected as `workflow_modified` (fail closed).
- **A15.** `ci_runs.agent_name` is the studio agent's name at ingest time, through the installation the run is attributed to. The artifact's `agent` and `agent_slug` are validated but never used for attribution or display.
- **A16.** "Active in N repos" counts only *accepted* ingested runs. Install and removal PR states are synced on Refresh and when CI Runs opens.
- **A17.** Each refresh lists at most the 50 newest completed runs per installed workflow file, plus one repo-wide page of 50 for foreign detection. Older runs and superseded attempts are not recovered.
- **A18 (narrowed).** If a deleted agent was the only installation in a repo, the repo is no longer polled. Its later runs are therefore not even logged as `foreign_workflow`. If other agents remain installed, the runs are logged (EC-42).
- **A19 (user-confirmed).** `foreign_workflow` logging uses an in-memory set of already-logged run ids, so each foreign run causes artifact calls and a log line once per server process.
- **A20 (user-confirmed).** For an installation in `removal_pending`, install, re-export and "Update CI config" for that agent return 409 `ci_removal_pending` and are hidden in the UI. Only refresh can move it out of that state (AC-96 / AC-97).
- **A21 (user-confirmed interpretation of AC-84).**
  - **Adopt:** an existing `.devdigest/agents/<slug>/` folder on the default branch is adopted, not counted as a collision, when its `manifest.yaml` carries this agent's `studio_agent_id` and no other installation holds the slug. This is the case after an earlier zip download. The first PR install then reuses that slug and updates (and syncs) those files, including an existing `devdigest-review-<slug>.yml`.
  - **Collision:** a folder or workflow belonging to a different agent, or a folder with no identity or an invalid one, is a collision and gets `-2`.
  - **Implementation:** this needs the optional `AgentManifest.studio_agent_id` (step 1) and `GitHubCiClient.getFileText` (steps 1 and 7).
  - **Tests:** steps 20 and 23.
  - **Spec follow-up:** R14 asks for AC-84's wording to be clarified.
- **A22.** The runner learns its agent from a literal `DEVDIGEST_AGENT_SLUG` env in the generated workflow. The check name is the job `name` `devdigest-review-<slug>`, and the workflow `name` is `DevDigest review (<slug>)`.
- **A23.** A missing runner bundle (AC-89) is reported as `ConfigError` (HTTP 500, code `config_error`), with a message naming `cd agent-runner && pnpm build`. The same applies to the zip download.
