# Development Plan: Onboarding Tour (SPEC-02)
Spec: specs/2026-10-10-onboarding-tour.md
Status: approved

## Development Plan: Onboarding Tour — deterministic repo facts, PageRank x (1 + hotness) reading path, one grounded LLM call, honest skeleton

### Requirements review
**Source reviewed:** `specs/2026-10-10-onboarding-tour.md` (SPEC-02). Its `Status:` is still **`draft`**. The user explicitly told me to plan against it anyway. This plan does not change the spec. All AC/EC/NFR ids below are the spec's stable ids.

**Clarifications:** `AskUserQuestion` is not available in this planner session. As the caller instructed, I did not stop. I chose single-agent mode and adopted each Open question's stated default. Each default is listed under "Open questions / assumptions" so the user can veto it before setting `Status: approved`.

**Execution mode:** single-agent. No subagents were used.

**What the code says about the spec's research** (all checked by reading the code):
- `onboarding` table exists (`server/src/db/schema/context.ts:120-127`). It is already exported from the `db/schema.ts` barrel and the `schema` object, so adding columns needs no barrel change.
- Feature model `onboarding` exists (`vendor/shared/contracts/platform.ts:15,48-50`). `container.resolveFeatureModel` resolves it (`platform/container.ts:247`).
- `server/src/prompts/onboarding.system.md` exists and lists a different section set. `client/messages/en/onboarding.json` describes a different section set, and nothing uses it (no `useTranslations("onboarding")` anywhere). Both are replaced (OQ-5).
- A legacy, unused `Onboarding`/`OnboardingSection`/`OnboardingLink` contract sits in `vendor/shared/contracts/knowledge.ts:28-47`. No code imports it. This plan leaves it alone and adds new `OnboardingTour*` names, so nothing collides.
- **There is no `modules/onboarding/` today.** `brief/*.ts` comments refer to a deleted `onboarding/service.ts`. The **`brief` module is the live exemplar** to copy, and it already solves the same problems:
  - a singleton service with an in-process `inFlight` guard (`brief/service.ts:36-113`, wired as a lazy `container.briefService` getter);
  - one structured call;
  - grounding before persist;
  - `wrapUntrusted` + `INJECTION_GUARD`;
  - a token-budget drop loop (`brief/prompts.ts:89-121`);
  - cost via `result.costUsd ?? priceBook.estimate(...)` (`brief/service.ts:162`);
  - a single structured log line with counts only;
  - a containment-checked clone reader (`brief/clone.ts`).
- `client/src/components/app-shell/helpers.ts:29` already maps any pathname containing `/onboarding` to the sidebar key **`onboarding-tour`**. A per-repo route `/repos/:repoId/onboarding` plus a nav item with `key: "onboarding-tour"` therefore highlights correctly with no shell change.
- `client/src/vendor/ui/nav.test.ts` asserts the exact SKILLS LAB list. It asserts nothing exact for WORKSPACE, so a new WORKSPACE item does not break it.
- `client/src/lib/github-urls.ts` `githubBlobUrl(fullName, sha, file)` exists, for AC-29. `client/src/lib/format.ts` has `relativeTime`, `formatCost` and `formatTokens`, for AC-27 and AC-37.
- `client/src/components/mermaid-diagram/MermaidDiagram.tsx` already validates with `mermaid.parse({suppressErrors})`, uses `securityLevel: "strict"`, and renders nothing for invalid input (AC-19 client side). Nothing else uses it yet.
- `@devdigest/ui` `Markdown` (`vendor/ui/primitives/Markdown.tsx`) uses react-markdown + remark-gfm without `rehype-raw`, so raw HTML shows as text and `javascript:` URLs are stripped by default. It does, however, render **every** other link, including GFM bare-URL autolinks. That fails the "links only to index paths or hosting links" half of AC-35, so step 4 adds a link-policy prop.
- The vendored `@devdigest/shared` copies are byte-identical today (`diff -r` is clean).

**Spec ↔ code conflicts (flagged; each has a default in this plan):**
- **C1 — NFR-4 vs AC-15/AC-16/AC-17 (blocking-ish, needs the owner's decision).** AC-15 and AC-16 say a failed or invalid LLM call stores a skeleton. NFR-4 says no failure path (invalid output, LLM error) may change the last stored tour.
  - **Default adopted (pure helper `decidePersistence`, step 7):**
    - `generated` always replaces the stored tour.
    - A skeleton caused by an LLM failure or invalid output is stored **only if no tour exists**. Otherwise the stored tour stays and the attempt is recorded as `last_failure`, shown next to the kept tour, as in AC-5.
    - A skeleton caused by the index state (AC-17) replaces a stored skeleton or nothing, but **never a stored `generated` tour**. That case is also recorded as `last_failure`.
    - A process error (`failed`) never writes the tour.
  - The AC-15, AC-16 and AC-17 integration tests therefore start from a repo with no stored tour. The NFR-4 test starts from a stored tour.
- **C2 — "exactly one call, no retry" vs the LLM adapters.** `adapters/llm/openai.ts:97-131` and `anthropic.ts:100-` (a) re-prompt on schema failure up to `req.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES`, and (b) wrap every HTTP call in `withRetry`, which retries 429, 5xx and network errors up to 3 times (`platform/resilience.ts`). Both break AC-15, AC-16 and NFR-1 (one call, no retry).
  - **Plan:** onboarding passes `maxRetries: 0`. A new optional `StructuredRequest.transportRetries?: number` is added to the port (step 1), honoured by both adapters (step 5), and set to `0` by onboarding. Other callers are unchanged.
- **C3 — hotness window.** `repo-intel/constants.ts:50` `HOTNESS_WINDOW_DAYS = 180`, which nothing uses (grep). The spec says 90 days. **Plan:** change it to `90` (step 6).
- **C4 — Critical paths shape.** `getCriticalPaths` returns dependency *chains* (`service.ts:815-854`). AC-11 wants ranked *files* with importer counts, and the spec itself notes this discrepancy. **Plan:** the tour does not use `getCriticalPaths`. It uses a new facade read, `getRankedFiles`, which returns importer counts. The existing method stays as is.
- **C5 — tie determinism.** `RepoIntelRepository.getRankedPaths` orders by `rank DESC` only (`repository.ts:449-459`), so ties come back in arbitrary order (breaks AC-7). **Plan:** the new repository query orders by `pagerank DESC, file_path ASC`, and the pure helpers sort again by (score desc, path asc).
- **C6 — index coverage.** The indexer walks only `SUPPORTED_EXT` = JS/TS (`pipeline/walk.ts`), so "files indexed" and the ranked sections cover JS/TS only. A non-JS repo indexes 0 files. AC-24/EC-12 then show "Not available: no import graph for this language". **Plan:** the directory structure ("with file counts", AC-25) comes from a separate bounded walk of the checkout that counts all files.
- **C7 — exclusion list.** The facade's private `JUNK_PATH_PATTERNS` (`service.ts:865-885`) has no generated-file patterns and is not exported. **Plan:** onboarding owns its own AC-10 classifier, `isExcludedFromTour` (step 7), covering tests, configs, `.d.ts`, migrations and generated files. The duplication is deliberate; listed for architecture review.
- **C8 — JobRunner is unfit for generation.** `platform/jobs.ts` retries a failed handler 2 times and has a 120 s timeout. It also has no de-dup. **Plan:** follow the `brief` precedent instead: a synchronous POST plus the singleton service's in-process `inFlight` set (AC-2, AC-3, NFR-4).
- **C9 — determinism of "last 90 days".** A wall-clock window would change hotness as time passes on an unchanged checkout (breaks AC-7). **Plan:** the window is anchored at the committer date of the **indexed commit** (`repo_index_state.last_indexed_sha`), not "now". This is an interpretation; the user can veto it.
- **C10 — pre-existing quirk.** The add-repository route `/onboarding` also matches `activeKeyFor` → `onboarding-tour`, so the new nav item highlights on the add-repo page too. It is pre-existing and out of scope; noted only.

**Recommended improvements to the spec** (for the spec owner; not edited by me):
1. **Blocking-ish.** Resolve C1 explicitly in the spec, e.g. "a skeleton never replaces a stored generated tour". **Adopted as the default above.**
2. **Non-blocking.** AC-23 says "3 to 5 tasks" but does not say what happens when fewer than 3 survive grounding. **Assumed:** fewer than 3 grounded tasks → First tasks shows "Not available" with the reason "fewer than 3 tasks cite real files". More than 5 → keep the first 5.
3. **Non-blocking.** AC-11 "highest-ranked" vs AC-8's score. **Assumed:** Critical paths use pure PageRank order (path asc for ties). The reading path uses PageRank x (1 + hotness).
4. **Non-blocking.** AC-2 "one generation record". **Assumed:** this is the `onboarding` row upsert plus the AC-36 log record. No separate generations history table.
5. **Non-blocking.** AC-36 "every generation attempt". **Assumed:** a request rejected by AC-3 as in progress is not an attempt (nothing starts), so it writes no AC-36 record.
6. **Non-blocking.** A rate limit on the generate endpoint is not specified. **Not added**: the single in-flight guard plus manual-only generation bound the cost, and a per-minute limit would make the AC-3 test flaky. Listed for security review.
7. **Non-blocking.** AC-20 lists env-example and compose files as "sources". Those files contain no literal command. **Assumed:** the system derives `cp <env-example> .env` and `docker compose -f <file> up -d` from their presence, labelled with that file as source.

**Test authorship for this run (user instruction):** non-trivial tests come from the spec's ACs and their `Verify:` hints, not from the finished code. They are owned by `test-writer` in steps 9, 10, 13 and 14, and **none of them may be deferred**.
- Steps 9 and 10 are **test-first in spirit**. They run in the same wave as the code they test and are written against the function signatures stated in this plan (steps 5-7), not against implementation files.
- Implementer inline tests are limited to the two trivial cases named in step 3 and step 5.

### Scope
This plan implements SPEC-02 end to end:
- **repo-intel facade.** Three new deterministic facade reads behind `repoIntel.*`:
  - ranked files with importer counts;
  - git-history hotness with a "not applied" fallback;
  - repository facts: stack, structure, routes and run commands.
- **Git port.** A new `GitClient.historyChurn` port method, and an LLM-port knob that disables transport retries.
- **onboarding server module.** Fact assembly; reading-path scoring; skeleton; one bounded structured LLM call; grounding and sanitisation; persistence rules; the in-flight guard; the AC-36 log.
- **Stored provenance.** New columns on the existing `onboarding` table, via a generated migration.
- **Contracts.** A new vendored contract file, mirrored to the client.
- **Prompt template.** The rewritten template.
- **Client.** A per-repo `/repos/[repoId]/onboarding` page, data hooks, the WORKSPACE nav item, a link-policy prop on the `Markdown` primitive, and rewritten i18n.

It does **not** cover:
- the Share link, automatic or scheduled generation, Project Context input, GitHub issues, executing commands, an in-app file viewer, multi-language tours, and LLM retries (all spec non-goals);
- deepening the git fetch (OQ-2 default);
- e2e browser flows;
- mcp-server;
- reviewer-core (untouched);
- removing the legacy `Onboarding` contract.

### Modules affected
- **server:**
  - `modules/repo-intel`: facade, repository, the new pure `pipeline/facts.ts`, constants;
  - a new `modules/onboarding`;
  - `adapters/git/simple-git.ts`, `adapters/llm/{openai,anthropic}.ts`, `adapters/mocks.ts`;
  - `db/schema/context.ts` plus a generated migration;
  - `vendor/shared` (contracts and ports);
  - `platform/container.ts`, `modules/index.ts`;
  - `src/prompts/onboarding.system.md`.
- **client:**
  - `vendor/shared` mirror;
  - `vendor/ui/nav.ts` (+ test), `vendor/ui/primitives/Markdown.tsx` (+ Showcase entry);
  - `lib/hooks/onboarding-tour.ts` + `lib/hooks/index.ts`;
  - the new route `app/repos/[repoId]/onboarding/**`;
  - `messages/en/onboarding.json`.
- **reviewer-core / e2e / mcp-server:** not touched.

### Architectural constraints
- **Root `AGENTS.md`:**
  - Vendored contracts must be mirrored by hand (`server/src/vendor/shared` ↔ `client/src/vendor/shared`).
  - Migrations never run on boot; the user runs `cd server && pnpm db:migrate`.
  - Never touch `server/clones/**`.
- **`server/AGENTS.md`:**
  - Onion layering. Only repositories touch Drizzle. Services take explicit deps, never `Container`.
  - `pnpm arch:check` must pass, and the baseline may only shrink.
  - Integration tests end in `*.it.test.ts`.
  - `src/db/migrations/*` are generated, never hand-edited.
- **`server/src/modules/repo-intel/AGENTS.md`:**
  - Consumers read **only through the facade**.
  - An unindexed or partial repo must **degrade gracefully** (empty results / `degraded`, never throw). Every new facade method keeps that contract.
- **`server/INSIGHTS.md`:**
  - Pure logic goes in `helpers.ts`/`constants.ts`/`pipeline/*` so arch-check's INNER regex covers it (2026-09-30). A new `facts.ts` must therefore live under `pipeline/`, and onboarding's pure code must live in `helpers.ts`.
  - The dependency graph and walk paths must be POSIX (2026-10-07). Normalize any `relative()` output in the new tree walk.
  - Mirroring with `Write` can flip CRLF → LF; prefer `Edit` and run `scripts/check-vendor-shared-sync.sh` (2026-09-24).
  - Do not read `container.config` unguarded in code exercised by hand-rolled container fakes (2026-09-24).
  - A "green" `.it` run can be 100% skipped when Docker is slow; check the skipped count (2026-09-20).
  - drizzle-kit: additive columns only. Dropping or renaming columns makes `db:generate` interactive (2026-09-20).
  - `repos.default_branch` mismatch makes resync fail silently (2026-10-07). This is relevant to the "index not built" skeleton status.
  - The `conventions` module's "model only proposes, code verifies" and `wrapUntrusted` pattern (2026-09-20) is the grounding model used here.
  - Windows: 6 pre-existing `indexer-pipeline.test.ts` failures (2026-09-20).
- **`.dependency-cruiser.cjs`:**
  - `repo-intel/service.ts` already depends on `Container` and on concrete adapters (baseline debt). The new facade methods must reach git only through `this.container.git` (the port), and **add no new import of `adapters/**`**.
  - The onboarding module must not import `modules/repo-intel/**` except `types.ts`/`index.ts`. Like `brief/ports.ts`, it declares local port shapes in its own `types.ts`.
- **`client/AGENTS.md` and `client/INSIGHTS.md`:**
  - UI imports come only from the `@devdigest/ui` barrel.
  - Components never fetch; data comes through `lib/hooks/*`.
  - Every `vendor/ui` change gets a Showcase entry.
  - Each `messages/en/*.json` file is its own namespace.
  - `user-event` is not installed; use `fireEvent`.
  - `Modal` is not a portal.
  - SVG/anchor links need `rel="noopener noreferrer"` (2026-10-05).
  - Watch for cp1252 `0x97` and CRLF churn after edits with "—" or "·" (2026-10-05).
  - "Generate" is mutation-driven; cancel the in-flight GET before `setQueryData` (brief hook pattern).
- **`client/src/vendor/ui/AGENTS.md`:** barrel-only; Showcase entry for changed components.
- **`TESTING.md`:** typological tests; hermetic mocks from `adapters/mocks.ts`; one real integration per data-backed workflow.

**Coordination with `docs/plans/2026-10-10-project-context-plan.md` (SPEC-01, not yet implemented):** both plans edit these files:
- `client/src/vendor/ui/nav.ts` and `nav.test.ts` (PC step 4);
- `server|client/src/vendor/shared/index.ts` (PC step 2);
- `client/src/lib/hooks/index.ts` (PC step 8);
- `server/src/platform/container.ts` and `server/src/modules/index.ts` (PC step 12).

Every such edit in this plan is **additive**: one new array entry, one new `export *` line, one new getter, one new registry line, one new `it` block. Rules:
1. Never run a wave of this plan and a wave of the PC plan at the same time.
2. Whichever plan runs second re-reads each shared file and appends with `Edit`, never a whole-file `Write`.
3. Contracts live in a **separate new file** (`contracts/onboarding-tour.ts`), so the only shared contract line is the barrel `export *`.
4. In nav, the tour item goes **after** `pulls` and after `context` if present. Its test uses `toContain`, not an exact list, so either order of landing passes.
5. Neither plan changes `activeKeyFor`.

### Steps

**Wave 1 — foundations (disjoint files, no inter-dependencies)**

1. [wave 1] `server/src/vendor/shared/contracts/onboarding-tour.ts` (new), `server/src/vendor/shared/index.ts`, `server/src/vendor/shared/adapters.ts`, and the same three files mirrored under `client/src/vendor/shared/`
   - **Contracts (new file):**
     - `OnboardingSectionState` = enum `ok | not_available | requires_generation`.
     - `TourSkeletonReason` = enum `index_degraded | index_failed | index_not_built | llm_unavailable | invalid_output`.
     - `RunStepKind` = enum `install | configure | services | run | other`.
     - `OnboardingTour`:
       - `architecture` = `{ state, reason: string|null, stack: {name, evidence}[], structure: {path, files}[], routes: string[], summary_markdown: string|null, diagram: string|null }`;
       - `critical_paths` = `{ state, reason, items: {path, importers: int, role, role_source: 'llm'|'deterministic'}[] }` (max 5);
       - `run_locally` = `{ state, reason, steps: {kind, command, source}[] }`;
       - `reading_path` = `{ state, reason, items: {position: int, path, reason, score: number}[], hotness: { applied: boolean, window_days: int, note: string|null } }` (max 10);
       - `first_tasks` = `{ state, reason, items: {title, rationale, files: string[]}[] }` (max 5);
       - `basis` = `{ files_indexed: int, files_considered: int }`;
       - `link_paths: string[]` (the AC-35 allowlist of index paths that LLM Markdown may link to).
     - `OnboardingTourProvenance` = `{ status: 'generated'|'skeleton', skeleton_reason: TourSkeletonReason|null, skeleton_detail: string|null, generated_at, indexed_sha, index_status, provider: string|null, model: string|null, files_indexed, files_considered, tokens_in: int|null, tokens_out: int|null, cost_usd: number|null }`.
     - `OnboardingTourState` (GET/POST response) = `{ status: 'none'|'generating'|'generated'|'skeleton', repo: {id, full_name}, tour: OnboardingTour|null, provenance: OnboardingTourProvenance|null, current_index_sha: string|null, last_failure: {reason: string, at: string}|null }`.
   - **Ports (`adapters.ts`):**
     - Add `HistoryChurn` `{ shallow: boolean; anchorDate: string|null; oldestDate: string|null; commits: number; counts: Record<string, number> }` and `GitClient.historyChurn(repo: RepoRef, anchorRef: string, windowDays: number): Promise<HistoryChurn>`. It counts per-path commits reachable from `anchorRef` with committer date ≥ the anchor date − `windowDays`. It never reads commit messages.
     - Add optional `StructuredRequest.transportRetries?: number` (default: the adapter's current behaviour).
   - **Barrel:** add `export * from './contracts/onboarding-tour.js';`.
   - **Mirroring:** prefer `Edit` for `index.ts` and `adapters.ts`; normalize CRLF on the new file to match its siblings.
   - **Implements:** AC-4, AC-9, AC-11, AC-12, AC-16, AC-20, AC-23, AC-25, AC-26, AC-27, AC-32, AC-35, AC-37, NFR-1.
   - **Governed by:** `zod` (schemas; `.max()` bounds on arrays and strings); `onion-architecture` (ports live in `vendor/shared/adapters.ts`; shared kernel, envelope shapes at the edge); `typescript-expert`; `security` (bounded strings).
   - **Owner:** implementer. This is the single owner of the cross-package contract change.

2. [wave 1] `server/src/db/schema/context.ts`, `server/src/db/migrations/<generated>` (+ drizzle meta journal/snapshot)
   - **New columns on `onboarding`, all additive with defaults:**
     - `status` text enum `generated|skeleton`, not null, default `'skeleton'`;
     - `skeleton_reason` text;
     - `skeleton_detail` text;
     - `indexed_sha` text, not null, default `''`;
     - `index_status` text;
     - `provider` text;
     - `model` text;
     - `files_indexed` int, not null, default 0;
     - `files_considered` int, not null, default 0;
     - `tokens_in` int;
     - `tokens_out` int;
     - `cost_usd` double precision;
     - `last_failure_reason` text;
     - `last_failure_at` timestamptz.
   - **Unchanged:** `json` (not null) and `generated_at`. The `repo_id` PK FK keeps `onDelete: cascade` (OQ-4/EC-14: the tour is deleted with the repo).
   - Run `cd server && pnpm db:generate`. The SQL must contain only `ALTER TABLE "onboarding" ADD COLUMN …`, with no DROP. Never hand-edit it.
   - **Implements:** AC-4, AC-5, AC-26, AC-27, AC-32, AC-37, EC-14, NFR-4.
   - **Governed by:** `drizzle-orm-patterns`, `postgresql-table-design` (nullable vs defaulted; text enum like `repo_index_state.status`), `onion-architecture`.
   - **Owner:** implementer.

3. [wave 1] `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/nav.test.ts`
   - Add `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "Layers", href: "/repos/:repoId/onboarding" }` to **WORKSPACE**, after `pulls` and after `context` if PC step 4 has landed. Add no `gKey` (`g o` would be a new shortcut, which is not requested). `"Layers"` already exists in `icons.tsx`, so no icon edit.
   - **Implements:** AC-34.
   - **Governed by:** `frontend-architecture` (vendored UI, deliberate edit; nav is a registry, not a component, so no Showcase entry).
   - **Owner:** implementer. Trivial inline test: a new `it` asserting WORKSPACE contains `onboarding-tour` and `resolveHref(item.href, "r1") === "/repos/r1/onboarding"`. The existing SKILLS LAB assertion stays green.

4. [wave 1] `client/src/vendor/ui/primitives/Markdown.tsx`, `client/src/components/showcase/Showcase.tsx`
   - Add an optional prop `transformHref?: (href: string) => string | null`. When it is given, the `a` renderer calls it:
     - `null` → render the link text as a plain `<span>` (no anchor);
     - a string → `<a href={result} target="_blank" rel="noopener noreferrer">`.
   - With no prop, behaviour is byte-identical to today, for existing callers.
   - Never add `rehype-raw`. Keep the default `urlTransform`.
   - Add a Showcase example with a policy that blocks all links.
   - **Implements:** AC-35, NFR-3b (client defence in depth).
   - **Governed by:** `frontend-architecture` (vendored UI + Showcase rule), `security` (no `dangerouslySetInnerHTML`; `javascript:` neutralised; `noopener`).
   - **Owner:** implementer. Its tests are in test-writer step 14.

**Wave 2 — ports/adapters, repo-intel facade, onboarding domain, client hooks, unit tests (after wave 1)**

5. [wave 2, after 1] `server/src/adapters/git/simple-git.ts`, `server/src/adapters/llm/openai.ts`, `server/src/adapters/llm/anthropic.ts`, `server/src/adapters/mocks.ts`
   - **`SimpleGitClient.historyChurn(repo, anchorRef, windowDays)`:**
     1. `git rev-parse --is-shallow-repository`.
     2. `git log -1 --format=%cI <anchorRef>` gives the anchor date.
     3. `git log --reverse --format=%cI <anchorRef>` gives the first line, the oldest available date, and the line count, the commits available.
     4. `git -c core.quotePath=false log <anchorRef> --since=<anchor−windowDays> --name-only --no-renames --format=%x00%H` gives per-path counts. Paths are already POSIX in git output.
     - Format strings must never include `%s`/`%B`, so no commit messages are read.
     - All arguments are passed as an array (simple-git, no shell).
     - Throws on a missing ref. The facade (step 6) catches it.
   - **Both LLM adapters:** `withRetry(fn, { retries: req.transportRetries ?? 3 })` in `completeStructured` only. Default behaviour is unchanged.
   - **`mocks.ts`:**
     - `MockGitOptions.churn?: HistoryChurn`, plus `MockGitClient.historyChurn` returning it, or a default `{shallow: true, commits: 1, counts: {}}`.
     - `MockLLMOptions.throwOnStructured?: Error` and `structuredDelayMs?: number`, both honoured in `completeStructured`. The call is recorded in `calls` **before** throwing or delaying, so call counts stay observable for AC-3, AC-15 and AC-16.
   - **Implements:** AC-3 (test seam), AC-8, AC-9, AC-15, AC-16, NFR-1, EC-3, EC-8.
   - **Governed by:** `onion-architecture` (`rules/adapters.md`: the adapter is an anti-corruption translator and imports no `modules/**`); `security` (no shell, no commit-message reads); `typescript-expert`.
   - **Owner:** implementer. Trivial inline test: one case in the existing `server/test/adapters.test.ts` asserting that `MockLLMProvider` with `throwOnStructured` records exactly one call and then rejects.

6. [wave 2, after 1] `server/src/modules/repo-intel/types.ts`, `service.ts`, `repository.ts`, `constants.ts`, `server/src/modules/repo-intel/pipeline/facts.ts` (new)
   - **`types.ts` additions (facade contract):**
     - `RankedFileRow {path; pagerank; importers}`.
     - `FileHotness {applied; windowDays; anchorSha: string|null; historyDays: number; commitsAvailable: number; reason?: 'shallow_history'|'no_clone'|'commit_missing'|'git_failed'|'flag_off'; counts: Record<string, number>}`.
     - `DetectedCommand {command; kind: 'install'|'configure'|'services'|'run'|'other'; source}`.
     - `StackItem {name; evidence}`, `DirStat {path; files}`.
     - `RepoFacts {stack; structure; routes: string[]; commands: DetectedCommand[]; totalFiles: number; degraded?; reason?: DegradedReason}`.
     - New `RepoIntel` methods:
       - `getRankedFiles(repoId): Promise<RankedFileRow[]>`;
       - `getFileHotness(repoId, windowDays?: number): Promise<FileHotness>`;
       - `getRepoFacts(repoId): Promise<RepoFacts>`.
   - **`repository.ts`:**
     - `getRankedFilesWithImporters(repoId)`: `file_rank` LEFT JOIN a count of distinct `file_edges.from_file` per `to_file`, ordered `pagerank DESC, file_path ASC` (C5). Returns mapped rows.
     - `getAllEndpoints(repoId)`: every `file_facts.endpoints` value, flattened, de-duplicated, sorted.
   - **`pipeline/facts.ts` (new, pure: no fs, no git, no DB):**
     - `detectPackageManager(paths)` returns `{pm, lockfile}|null`, mapping `pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, `package-lock.json`→npm, `bun.lockb`→bun.
     - `commandsFromPackageJson(source, rawJson, pm)`: an install command for the manifest's directory, plus `<pm> run <script>` for each script, each classified. Invalid JSON gives `[]`.
     - `extractShellFences(markdown, source)`: lines of ```` ```bash|sh|shell|console|zsh ```` fences only. Strips a leading `$ `, skips comments and blank lines, caps line count and length.
     - `envExampleCommand(path)` and `composeCommand(path)` (recommendation 7).
     - `classifyCommand(cmd)` gives a `RunStepKind`. Rules in order: install verbs (`install`, `i`, `ci`, `add` w/o args, `pip install -r`, `bundle install`, `go mod download`); `cp .env…`/`*migrate*`/`*setup*` → configure; `docker compose … up`/`docker-compose up` → services; `dev`/`start`/`serve`/`run` scripts → run; else other.
     - `detectStack(paths, manifests)`: a fixed table of manifest/dependency → name (e.g. `next`, `react`, `fastify`, `express`, `drizzle-orm`, `pyproject.toml`→Python, `go.mod`→Go, `Cargo.toml`→Rust, `Dockerfile`→Docker). Output sorted by name.
     - `summarizeStructure(paths, depth = 2)` gives `DirStat[]` sorted by path.
     - All outputs sort deterministically.
   - **`service.ts` (facade implementations; never throw; degrade):**
     - `getRankedFiles`: flag off or no rows gives `[]`.
     - `getFileHotness(repoId, windowDays = HOTNESS_WINDOW_DAYS)`:
       1. Index state: no `lastIndexedSha` gives `applied: false, reason: 'commit_missing'`.
       2. Repo basics: no clone gives `no_clone`.
       3. `this.container.git.hasCommit(ref, sha)`, else `commit_missing`.
       4. `historyChurn(ref, sha, windowDays)` inside try/catch; a throw gives `git_failed`.
       5. `applied = !(churn.shallow && oldestDate > anchorDate − windowDays)` (C9, AC-9). `historyDays` = days between oldest and anchor.
       6. Counts are returned raw. Normalisation is the consumer's job (step 7).
     - `getRepoFacts`:
       - Bounded fs walk of the clone (max depth 6, at most 20 000 entries, skip `EXCLUDED_DIRS` and symlinks, POSIX relative paths).
       - Read manifests, README (`README.md`/`readme.md` at the root) and any `package.json` (up to 50) **through `resolveContainedPath`** (`modules/_shared/checkout-paths.ts`), each ≤ 256 KB.
       - Feed the `pipeline/facts.ts` parsers. `routes` come from `getAllEndpoints`.
       - No clone gives `{…empty, degraded: true, reason: 'no_data'}`.
     - **Only `this.container.git` and `node:fs` are used; no new `adapters/**` import** (baseline must not grow).
   - **`constants.ts`:**
     - `HOTNESS_WINDOW_DAYS = 90` (C3).
     - New `FACTS_MAX_WALK_ENTRIES = 20_000`, `FACTS_MAX_MANIFESTS = 50`, `FACTS_MAX_FILE_BYTES = 256 * 1024`, `FACTS_MAX_FENCE_LINES = 40`.
   - **Implements:** AC-6, AC-7, AC-8 (raw inputs), AC-9, AC-11 (importer counts), AC-20, AC-22 (classification), AC-25 (structure with counts), EC-1, EC-2, EC-3, EC-5, EC-12, EC-13 (inert parsing only), NFR-2, NFR-3c (command set source).
   - **Governed by:**
     - `onion-architecture` — read only through the facade; pure parsers in `pipeline/` (INNER); Drizzle only in `repository.ts` with mapped return types; no new adapter imports; degrade, never throw.
     - `drizzle-orm-patterns` — join/aggregate query.
     - `security` — containment-checked reads, size caps, symlinks not followed, untrusted manifests parsed with try/catch.
     - `typescript-expert`.
   - **Owner:** implementer.

7. [wave 2, after 1] `server/src/modules/onboarding/constants.ts`, `types.ts`, `helpers.ts`, `schemas.ts`, `prompt.ts`, `clone.ts` (all new), `server/src/prompts/onboarding.system.md` (rewrite)
   - **`constants.ts`:**
     - `ONBOARDING_FEATURE = 'onboarding'`.
     - `TOUR_TOP_FILES = 30`, `EXCERPT_MAX_BYTES = 2048`, `INPUT_TOKEN_CAP = 24_000` (OQ-1).
     - `MAX_CRITICAL_PATHS = 5`, `MAX_READING_PATH = 10`, `FIRST_TASKS_MIN = 3`, `FIRST_TASKS_MAX = 5`.
     - `HOTNESS_WINDOW_DAYS = 90`.
     - `LLM_MAX_OUTPUT_TOKENS = 3000`, `LLM_TIMEOUT_MS = 45_000`, `LLM_TEMPERATURE = 0.2`.
     - `EXCLUDED_PATH_PATTERNS` (AC-10, C7): tests (`.test.`, `.spec.`, `__tests__/`, `/test/`, `/tests/`, `e2e/`); configs (`.config.`, `rc.`, `vitest.`, `jest.`, `eslint`, `prettier`, `tsconfig`); declarations (`.d.ts`); migrations (`/migrations/`, `/migrate/`); generated (`/generated/`, `__generated__/`, `.generated.`, `.gen.`, `.min.js`, `/dist/`, `/build/`).
   - **`types.ts` (ports, local shapes; no import from `modules/repo-intel/**` except `types.ts`, whose types may be re-used):**
     - `OnboardingRepoIntelPort`: the `getIndexState`, `getRankedFiles`, `getFileHotness`, `getRepoFacts` and `getSymbolsInFiles` subset.
     - `OnboardingStore`:
       - `getRepo(ws, repoId)` returns `{id, owner, name, fullName, clonePath}`, or `undefined` from another workspace;
       - `getTour(repoId)` returns a domain row;
       - `upsertTour(row)`;
       - `recordFailure(repoId, reason, at)`, which updates only the failure columns when a row exists.
     - `ExcerptReader = (clonePath, path, maxBytes) => Promise<string|null>`.
     - `LlmResolver`, `FeatureModelResolver`, `CostEstimator`, `TokenCounter`, `OnboardingLogger {info(obj, msg)}`.
     - `OnboardingDeps` bundling all of the above, plus `now?: () => Date`.
   - **`helpers.ts` (pure; these exact signatures are what test-writer step 9 codes against):**
     - `isExcludedFromTour(path: string): boolean` (AC-10).
     - `normalizeHotness(counts: Record<string, number>): Record<string, number>`: value / max, all 0 when max is 0 (AC-8).
     - `scoreReadingPath(rows: RankedFileRow[], hotness: Record<string, number>, applied: boolean): {path, pagerank, hotness, score}[]`. It excludes paths via `isExcludedFromTour`, computes `score = pagerank * (1 + (applied ? hotness[path] ?? 0 : 0))`, and sorts score desc, then path asc (AC-7, AC-8, AC-9, AC-10).
     - `selectCriticalPaths(rows, symbolsByPath: Record<string, string[]>): {path, importers, role, role_source:'deterministic'}[]`. At most 5, after exclusions, pagerank desc / path asc. Deterministic role: `"Imported by N files; exports a, b, c"`, or `"Imported by N files"` (AC-11).
     - `buildReadingPath(scored, limit = 10): {position, path, reason, score}[]`. Positions 1..n. Deterministic non-empty reason, e.g. `"PageRank #k; imported by N files; M commits in the last 90 days"`, omitting the commit part when hotness is not applied (AC-12).
     - `orderRunSteps(cmds: DetectedCommand[]): DetectedCommand[]`. Stable order install → configure → services → run → other; within a kind, source path asc then detection order. Exact duplicates (same command + source) are removed (AC-20, AC-22).
     - `hotnessNote(h: FileHotness): string|null`. When not applied: `"Hotness not applied: the checkout has N commit(s) covering D day(s) of history; 90 days are needed."` (AC-9).
     - `skeletonReasonFor(indexState): TourSkeletonReason|null`. `full|partial` gives `null`; `degraded` with `reason 'no_data'` or empty `lastIndexedSha` gives `index_not_built`; `degraded` gives `index_degraded`; `failed` gives `index_failed` (AC-17).
     - `buildSkeleton(facts: TourFacts): OnboardingTour` (AC-25, AC-24):
       - Every deterministic part is populated.
       - The architecture narrative is `summary_markdown: null` with `state: 'requires_generation'`. First tasks is `state: 'requires_generation'`.
       - A section with no deterministic content is `not_available` with a reason. Examples: `"No import graph for this language (0 files indexed)"`, `"No run commands detected (no package manifest, compose file, env example or README shell block)"`.
     - `validateLlmOutput(raw: unknown, ctx: {indexPaths: Set<string>, commands: DetectedCommand[], readingPaths: string[], criticalPaths: string[]}): {ok: true, value: ValidatedLlm, dropped: {paths, commands, entries}} | {ok: false, reason: string}`:
       - Strict Zod parse of the five-section schema. On failure, `reason` = the first issue path + message (AC-15).
       - Drop references to paths not in `indexPaths`. Drop any critical-path / reading-path / first-task entry left without a valid file (AC-18, EC-6).
       - Drop commands not exactly equal to a detected command (AC-21, EC-13).
       - Reading-path and critical-path LLM entries only supply `reason`/`role` text for paths already in the deterministic lists. The order is never taken from the model (AC-7).
       - First tasks: keep at most 5; fewer than 3 grounded gives a section-level not-available (recommendation 2) (AC-23).
     - `sanitizeDiagram(src: string|null): string|null`. Returns null unless the source starts with `flowchart|graph` (the template allows only these), has at most 4000 chars, and contains no `<`, `click `, `href`, `call ` or `%%{` (directives) (AC-19, NFR-3b).
     - `neutralizeMarkdown(md: string, indexPaths: Set<string>): {text, linkPaths: string[]}` (AC-35, NFR-3b):
       - Escape raw HTML (`<` → `&lt;`).
       - Remove images.
       - Keep `[t](p)` only when `p` is a relative path in `indexPaths`, and collect `p` into `linkPaths`. Rewrite every other link to its text.
       - Wrap bare `http(s)://` / `javascript:` occurrences in backticks so GFM cannot autolink them.
     - `mergeTour(skeleton, validated): OnboardingTour`. LLM text fills only the slots validation kept. A section left empty after validation keeps its deterministic content, or becomes `not_available` with a reason (AC-24).
     - `classifyLlmError(err: unknown): 'invalid_output'|'llm_unavailable'`. `invalid_output` iff the message matches `/schema validation|failed schema/i` (the adapters' and the mock's wording); everything else, including timeouts and quota, is `llm_unavailable` (AC-15, AC-16).
     - `decidePersistence(stored: {status}|null, outcome: {kind: 'generated'|'skeleton'|'failed', skeletonReason?}): 'replace'|'keep'`, per the C1 rule (NFR-4, AC-5).
     - `isStale(tourSha, currentSha): boolean` and `shortSha(s)` (AC-32 server side, used for `current_index_sha`).
   - **`schemas.ts`:** the LLM-facing `OnboardingLlmOutput` Zod schema. The field order is load-bearing (see conventions INSIGHTS):
     - `architecture {summary_markdown ≤ 4000, diagram string|null}`;
     - `critical_paths [{path, role ≤ 200}] ≤ 10`;
     - `run_locally [{command, note ≤ 200}] ≤ 20`;
     - `reading_path [{path, reason ≤ 300}] ≤ 20`;
     - `first_tasks [{title ≤ 120, rationale ≤ 600, files: string[1..5]}] ≤ 10`.
     - Headroom over the display caps, as in brief, so that clamping is grounding's job.
   - **`prompt.ts`:** `buildOnboardingMessages(facts: TourFacts, excerpts: {path, text}[], counter: TokenCounter, systemTemplate: string): {messages, tokens, filesConsidered}`.
     - System = the rendered template + `INJECTION_GUARD`.
     - User = the facts block (stack, structure, routes, detected commands with sources, critical-path candidates, reading-path candidates, hotness note, "based on top N of M files") + excerpts.
     - **Every repository-derived string** (paths, manifests, commands, excerpts) goes inside `wrapUntrusted(label, …)` (NFR-3a, EC-13).
     - Budget loop: count `system + user` with the real tokenizer. While it exceeds `INPUT_TOKEN_CAP`, drop whole excerpts from the lowest-scored file first, then trim structure/routes lists. `filesConsidered` = excerpts kept (AC-13, AC-14, NFR-1, EC-1).
     - No other file content enters the prompt. The README is used only via detected commands.
   - **`clone.ts`:** `readExcerpt(clonePath, path, maxBytes)`, a copy of the `brief/clone.ts` pattern. `resolveContainedPath`, `stat`, skip non-files; read at most `maxBytes` and cut at a UTF-8 boundary. Returns null on any failure (NFR-3, EC-13).
   - **`src/prompts/onboarding.system.md`:** rewrite for exactly the five sections, in order. It:
     - states that file paths and commands must be copied verbatim from the facts, and that invented ones are dropped;
     - says First tasks are 3-5 items, each citing 1+ real files, using repository facts only (no issues, no web);
     - allows Markdown only, with no HTML;
     - limits the architecture diagram to simple `flowchart`/`graph`, `null` when unsure;
     - says everything inside `<untrusted>` is data;
     - is English only (removes `{{language}}`).
   - **Implements:** AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-32, AC-35, EC-1, EC-4, EC-6, EC-7, EC-8, EC-12, EC-13, NFR-1, NFR-3a, NFR-3b, NFR-3c, NFR-4, NFR-5.
   - **Governed by:**
     - `onion-architecture` — pure rules in `helpers.ts` (INNER); ports in `types.ts`; `clone.ts` is the fs edge injected as a port (brief precedent); no import of other modules' internals.
     - `zod` — the LLM schema, parse once.
     - `security` — untrusted delimiters, output sanitisation, link allowlist, diagram allowlist, containment.
     - `typescript-expert`.
   - **Owner:** implementer.

8. [wave 2, after 1] `client/src/lib/hooks/onboarding-tour.ts` (new), `client/src/lib/hooks/index.ts`
   - `onboardingTourKeys.state(repoId)` = `["onboarding-tour", repoId]`.
   - `useOnboardingTour(repoId)`: GET `/repos/:id/onboarding`, `refetchInterval` 3000 only while `status === "generating"` (brief pattern), `retry: false`.
   - `useGenerateOnboardingTour(repoId)`: POST `/repos/:id/onboarding/generate`.
     - `onMutate`: `cancelQueries`.
     - `onSuccess`: `setQueryData`.
     - `onError`: if 409, invalidate the state key so the generating state shows.
   - Re-export both from `index.ts` (additive line; see Coordination).
   - **Implements:** AC-1 (no auto-generate: GET only), AC-2, AC-3 (409 handling), AC-33.
   - **Governed by:** `frontend-architecture` (hooks are the only data surface; `lib/api.ts`), `react-best-practices` (no query data copied into state), `next-best-practices`, `typescript-expert`.
   - **Owner:** implementer.

9. [wave 2, after 1; parallel with 6-7] `server/test/onboarding-helpers.test.ts` (new), `server/test/onboarding-prompt.test.ts` (new), `server/test/repo-intel-facts.test.ts` (new). All unit lane.
   - Cases are taken from the spec ACs and `Verify:` hints and coded against the signatures in steps 6-7. They are **not** derived from the implementation.
   - **`onboarding-helpers.test.ts`:**
     - AC-7: run `scoreReadingPath` + `buildReadingPath` + `selectCriticalPaths` twice on the same fixture; deep-equal, including a tie ordered by path asc.
     - AC-8: fixture with pagerank `{a: .3, b: .2, c: .2, d: .1}` and counts `{a: 0, b: 4, c: 2, d: 8}` gives normalized hotness and exact scores. Order asserts the tie case.
     - AC-9: `applied: false` gives the pure-PageRank order, and `hotnessNote` mentions commits and days.
     - AC-10: each excluded kind (`x.test.ts`, `vitest.config.ts`, `types.d.ts`, `db/migrations/0001.ts`, `src/__generated__/a.ts`, `dist/a.js`) with top rank appears in neither list.
     - AC-11: at most 5 entries, pagerank order, correct importers.
     - AC-12: 12 eligible files give exactly 10 entries numbered 1-10, each with a non-empty reason.
     - AC-18: one real and one invented path; an entry made only of invented paths is removed.
     - AC-21: one detected and one invented command; only the detected one survives.
     - AC-15: malformed shape gives `ok: false` with a reason.
     - AC-23: 6 tasks give 5, and 2 grounded tasks give not-available.
     - AC-19: `sanitizeDiagram` returns null for `sequenceDiagram`, for `<script>`, for `click` and for `%%{init}`, and keeps a valid flowchart.
     - AC-35/NFR-3b: `neutralizeMarkdown` on `<script>`, `[x](javascript:alert(1))`, `[y](https://evil)`, a bare URL, and `[ok](src/a.ts)` → only `src/a.ts` remains a link and appears in `linkPaths`.
     - AC-24/EC-12: `buildSkeleton` with 0 indexed files gives Critical paths and Reading path `not_available` with the "no import graph" reason, while other sections render. EC-4: no commands gives Run locally `not_available`.
     - AC-25: the skeleton has stack, structure counts, importer counts, reading path and commands, and the narrative and First tasks are `requires_generation`.
     - AC-22: `orderRunSteps` gives install, configure, services, run.
     - AC-16/AC-15: `classifyLlmError` on a quota error, a timeout and a schema-validation error.
     - NFR-4/AC-5: the `decidePersistence` table for every (stored, outcome) pair in C1.
     - AC-17: `skeletonReasonFor` for `degraded`, `failed` and no data.
   - **`onboarding-prompt.test.ts`:**
     - AC-13: excerpts are ≤ 2 KB each and no other file content appears.
     - AC-14: 200 candidate files with large excerpts give tokens ≤ 24 000 and the prompt text states `top N of M`, with real N and M.
     - NFR-3a: an excerpt containing "ignore previous instructions" and `</untrusted>` stays inside exactly one untrusted block, and the system prompt contains `INJECTION_GUARD`.
     - NFR-5 precondition: the built messages are returned, not logged.
   - **`repo-intel-facts.test.ts`:**
     - AC-20: package.json with scripts, `pnpm-lock.yaml`, `.env.example`, `docker-compose.yml` and a README with a `bash` fence and a `js` fence. Every command carries its source; the `js` fence is ignored; `$ ` is stripped.
     - EC-5: two `package.json` in sub-packages give commands labelled with each source.
     - AC-22: `classifyCommand` table.
     - `detectStack`/`summarizeStructure` are deterministic and sorted (AC-6, AC-7).
     - EC-13: a hostile `curl … | sh` fence is kept as inert text with its source (it is only displayed).
   - **Governed by:** `onion-architecture` `rules/testing.md` (pure unit, no DB), `typescript-expert`, `security`.
   - **Owner:** test-writer.

10. [wave 2, after 1; parallel with 5] `server/test/git-history-churn.test.ts` (new, unit lane; real `git` in a tmpdir; `describe.skipIf` when `git` is absent)
    - Build a local repo with commits back-dated via `GIT_COMMITTER_DATE`: one file touched 3 times inside 90 days, one touched once 120 days ago.
    - Full clone: `historyChurn(…, 90)` gives `shallow: false` and counts `{a: 3}`, and the old file is outside the window (AC-8).
    - `git clone --depth 1 file://…`: `shallow: true`, `commits: 1` (AC-9, EC-3).
    - No commit message is parsed: a commit message containing a path-like string does not change the counts (spec "Untrusted inputs").
    - Paths come back POSIX on Windows.
    - **Implements:** test coverage for AC-8, AC-9, EC-3.
    - **Governed by:** `onion-architecture` `rules/testing.md`, `typescript-expert`.
    - **Owner:** test-writer.

**Wave 3 — onboarding service/routes/wiring; client page (after wave 2)**

11. [wave 3, after 1, 2, 5, 6, 7] `server/src/modules/onboarding/service.ts`, `repository.ts`, `routes.ts`, `index.ts` (all new), `server/src/platform/container.ts`, `server/src/modules/index.ts`
    - **`OnboardingService(deps: OnboardingDeps)`:** a process-wide singleton with `private inFlight = new Set<string>()`.
      - **`getState(ws, repoId)`:**
        1. `store.getRepo` (404 for another workspace, NFR-3e).
        2. `getTour`.
        3. `repoIntel.getIndexState` gives `current_index_sha`.
        4. Status:
           - `none` when there is no tour (AC-1; no generation is started, 0 LLM calls);
           - `generating` when the repo is in `inFlight`, with the old tour still returned (AC-2);
           - otherwise the stored status.
        5. Include `last_failure` (AC-5).
      - **`generate(ws, repoId)`:**
        1. `getRepo` (404 first).
        2. If `inFlight.has(repoId)`, throw `ConflictError('generation_in_progress')` (409), starting nothing (AC-3, EC-9, NFR-4). The `has` and `add` checks sit in one synchronous block with no `await` between them (brief precedent).
        3. In a `try/finally` that deletes from `inFlight`:
           a. `t0 = now()`.
           b. **Facts:** `getIndexState`, `getRepoFacts`, `getRankedFiles`, `getFileHotness(90)`, then `getSymbolsInFiles` for the top critical candidates. No LLM (AC-6).
           c. Deterministic ranking (`scoreReadingPath`, `buildReadingPath`, `selectCriticalPaths`, `orderRunSteps`), then `skeleton = buildSkeleton(...)` (AC-7 to AC-12, AC-20, AC-22, AC-25).
           d. If `skeletonReasonFor(state)` is non-null, the outcome is skeleton with **0 LLM calls** (AC-17, EC-2).
           e. Otherwise:
              - Read excerpts for the top `TOUR_TOP_FILES` reading candidates via `ExcerptReader`.
              - `buildOnboardingMessages`.
              - `resolveModel(ws)` (OQ-6, feature `onboarding`), then `llm(provider)`.
              - **Exactly one** `completeStructured({ model, schema: OnboardingLlmOutput, schemaName: 'OnboardingTour', messages, maxRetries: 0, transportRetries: 0, timeoutMs: LLM_TIMEOUT_MS, maxTokens, temperature })` (AC-13, NFR-1).
              - On throw: skeleton with reason `classifyLlmError(err)` and detail = the error message (truncated to 300 chars, never raw output) (AC-15, AC-16, EC-7, EC-8).
              - On success: `validateLlmOutput`. Invalid gives skeleton `invalid_output` + reason (AC-15). Valid gives `mergeTour`, with `neutralizeMarkdown` and `sanitizeDiagram` applied, and `link_paths` set (AC-18, AC-19, AC-21, AC-23, AC-24, AC-35, NFR-3b, NFR-3c).
              - Cost = `result.costUsd ?? estimateCost(model, tokensIn, tokensOut)`.
           f. `decidePersistence(stored, outcome)`. `replace` gives `upsertTour` (json + every AC-4 column + `generated_at`, clearing `last_failure_*`). `keep` gives `recordFailure` (AC-4, AC-5, NFR-4, C1).
           g. An unexpected exception anywhere gives outcome `failed`: `recordFailure` when a row exists, the stored tour is untouched, and the service returns the state with `last_failure` (no rethrow). An FK violation after the repo was deleted mid-run is caught here, so no orphan row is possible (EC-10, EC-14).
           h. **One** `logger.info({...}, 'onboarding.generate')` per attempt (AC-36, NFR-5), with these fields only: `repo_id, outcome, llm_calls (0|1), tokens_in, tokens_out, cost_usd, model, provider, duration_ms, files_indexed, files_considered, skeleton_reason, dropped: {paths, commands, entries}`. **Never** excerpts, the prompt, LLM text or commands.
        4. Return the fresh `getState`.
      - No method runs a command or spawns a process (AC-31, NFR-3d). No GitHub client or other HTTP dependency exists in `OnboardingDeps` (AC-23, NFR-1).
    - **`repository.ts`:**
      - `getRepo` is workspace-scoped (`repos.workspaceId`).
      - `getTour` / `upsertTour` (`onConflictDoUpdate` on `repo_id`) / `recordFailure` (update by `repo_id` only).
      - It maps rows to domain shapes and never returns `$inferSelect`.
    - **`routes.ts`:** `withTypeProvider<ZodTypeProvider>()`, `IdParams`, `getContext`, then one service call each:
      - `GET /repos/:id/onboarding` returns `OnboardingTourState`.
      - `POST /repos/:id/onboarding/generate` returns `OnboardingTourState`, or 409 via `ConflictError`.
    - **`index.ts`:** public surface (types re-export only).
    - **`container.ts`:** a lazy `onboardingService` getter (singleton, brief precedent) wiring:
      - `new OnboardingRepository(this.db)`;
      - `this.repoIntel`;
      - `(ws) => this.resolveFeatureModel(ws, 'onboarding')`;
      - `(id) => this.llm(id)`;
      - `readExcerpt`;
      - `this.tokenizer`;
      - `this.priceBook.estimate`;
      - `loadPromptTemplate('onboarding.system.md')` (passed as a loader function);
      - `console`.
    - **`modules/index.ts`:** register `onboarding` (additive; see Coordination).
    - **Implements:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-21, AC-23, AC-25, AC-31, AC-36, EC-1, EC-2, EC-7, EC-8, EC-9, EC-10, EC-14, NFR-1, NFR-2, NFR-3d, NFR-3e, NFR-4, NFR-5.
    - **Governed by:**
      - `onion-architecture` — the route validates and makes one service call; the service takes Deps, never `Container`; only the repository touches Drizzle; the composition root is the only place concrete pieces meet; `AppError` family only; no addition to the arch baseline.
      - `fastify-best-practices` — schema on the route, type provider, registry plugin.
      - `drizzle-orm-patterns` — upsert, mapper.
      - `zod`.
      - `security` — IDOR via workspace-scoped repo lookup, no content in logs or errors, no process execution.
      - `typescript-expert`.
    - **Owner:** implementer.

12. [wave 3, after 3, 4, 8] `client/src/app/repos/[repoId]/onboarding/page.tsx` (new, thin), `client/src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/` (new: `index.ts`, `OnboardingTourView.tsx`, `styles.ts`, `helpers.ts`, `constants.ts`, `hooks/useActiveSection.ts`, `_components/{TourHeader,SectionNav,TourSectionCard,ArchitectureSection,CriticalPathsSection,RunLocallySection,ReadingPathSection,FirstTasksSection,TourStatusBadge,StaleNote,TourFooter}/`), `client/messages/en/onboarding.json` (rewrite)
    - **`page.tsx`:** renders `<OnboardingTourView />` only. The view is `"use client"`, reads `repoId` from `useParams`, and uses `useOnboardingTour` / `useGenerateOnboardingTour`.
    - **Early-return states (AC-33, AC-1):**
      - loading: `Skeleton`;
      - error: `ErrorState` + retry;
      - empty (`status: none`): `EmptyState` with the "Generate onboarding tour" CTA; no auto-generate;
      - generating: text "Generating onboarding tour…", **no Generate/Regenerate button rendered**, and the previous tour shown read-only if one exists (AC-2);
      - data.
    - **`TourHeader`:**
      - `Onboarding for <repo name>` (AC-27).
      - `Generated from index of N files · last refreshed <relativeTime>`, where N = `provenance.files_indexed` (AC-27).
      - `Based on top N of M files` (AC-14).
      - A Regenerate button. No Share link (non-goal).
      - `TourStatusBadge` text: "Generated", or "Skeleton — index degraded / index failed / index not built / LLM unavailable / generation failed: <detail>" (AC-26, NFR-6c).
      - A `last_failure` notice next to the kept tour: "Last regeneration failed: <reason>" (AC-5).
    - **`StaleNote`:** shown iff `current_index_sha` is non-null and differs from `provenance.indexed_sha`. Shows both 7-char ids and "this tour may be out of date" (AC-32, EC-11, NFR-6c).
    - **`SectionNav` ("On this page"):** five entries in fixed order from `constants.ts` `SECTION_ORDER`. Click calls `scrollIntoView` and sets active. `useActiveSection` uses `IntersectionObserver` when present, else click-only. The active entry gets `aria-current="true"` (AC-28, NFR-6a).
    - **`TourSectionCard`:** collapsible. Header `<button aria-expanded aria-controls>`, operable with Enter/Space (native button). The body shows `not_available` + reason as "Not available: <reason>" and `requires_generation` as "Requires generation" (AC-24, AC-25, AC-28, NFR-6a).
    - **`ArchitectureSection`:**
      - Stack list and structure (path + file count), routes list.
      - `summary_markdown` via `Markdown` with `transformHref = helpers.tourHref(tour.link_paths, fullName, indexedSha)`. It maps allowed paths to `githubBlobUrl`, everything else to `null` (AC-35).
      - `diagram` via `MermaidDiagram`, rendered only when non-null. An invalid diagram renders nothing and the prose still shows (AC-19).
    - **`CriticalPathsSection`** (path, "imported by N", role) and **`ReadingPathSection`** (position, path, reason, plus the hotness note when not applied) (AC-9, AC-11, AC-12):
      - Each row has an **Open** anchor: `href={githubBlobUrl(fullName, indexedSha, path)}`, `target="_blank"`, `rel="noopener noreferrer"`, `aria-label="Open <path> on GitHub"` (AC-29, OQ-3, NFR-6b).
      - Paths render as text (React escaping) (AC-35, EC-13).
    - **`RunLocallySection`:**
      - Numbered steps in server order. Each command is in a `<code>` block, inert, with its source label `from <source>` (AC-20, AC-22, EC-5).
      - A copy `IconBtn` wrapped in a labelled button: `aria-label="Copy command: <command>"`, calling `navigator.clipboard.writeText(command)` with exactly the command (AC-30, NFR-6b).
      - Notice above the list: "These commands come from the repository. Review them before running — DevDigest never runs them." (AC-31, NFR-3d).
    - **`FirstTasksSection`:** 3-5 tasks: title, rationale (Markdown with the same `transformHref`), and file chips each with Open. Or "Requires generation" / "Not available: <reason>" (AC-23, AC-24, AC-25).
    - **`TourFooter`** (COULD): model, `formatTokens(tokens_in, tokens_out)`, `formatCost(cost_usd)` when present (AC-37).
    - **`helpers.ts` (pure):** `statusLabel(provenance)`, `isStale(a, b)`, `shortSha`, `tourHref(linkPaths, fullName, sha)`, `sectionId(key)`.
    - **`onboarding.json`:** replaced with the five-section strings, states, notices, aria labels and badge texts. The old keys and the overview/architecture/key-modules/getting-started/conventions text are removed (OQ-5). Check "—" and "·" bytes after the edit (client INSIGHTS 2026-10-05).
    - **Implements:** AC-1, AC-2, AC-5, AC-9, AC-11, AC-12, AC-14, AC-19, AC-20, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-35, AC-37, EC-4, EC-5, EC-11, EC-12, EC-13, NFR-3b, NFR-3d, NFR-6.
    - **Governed by:**
      - `frontend-architecture` — thin `page.tsx`; route-private `_components` each in its own folder; styles, constants and helpers colocated; `@devdigest/ui` barrel only; `MermaidDiagram` from `@/components/mermaid-diagram`; strings in `messages/en/onboarding.json`.
      - `react-best-practices` — early-return states; derive at render; no `useEffect` business logic beyond the observer hook; keys = path.
      - `next-best-practices` — `"use client"` on the view, not the page.
      - `security` — no `dangerouslySetInnerHTML`; `noopener`; link allowlist.
      - `typescript-expert`.
    - **Owner:** implementer.

**Wave 4 — integration and UI tests from the ACs (after wave 3)**

13. [wave 4, after 11] `server/test/onboarding.it.test.ts` (new; must end in `.it.test.ts`; Testcontainers pg)
    - **Setup:**
      - Fakes come from `adapters/mocks.ts` (`MockLLMProvider` with `structuredBySchema['OnboardingTour']`, `throwOnStructured`, `structuredDelayMs`; `MockGitClient` with `churn`) plus a fake `RepoIntel` override (cast via `unknown`, as `blast-routes.it` does).
      - A container `github` override that throws if touched, and a `globalThis.fetch` spy.
      - Cases come from the spec's `Verify:` hints.
    - **Cases:**
      - AC-1: GET with no tour gives `status: none`, mock LLM calls 0, no `onboarding` row.
      - AC-2: POST gives one row. During a delayed mock, a concurrent GET reports `generating`.
      - AC-3/EC-9/NFR-4: two triggers with `structuredDelayMs` give one 200 and one 409 `generation_in_progress`, and the mock LLM is called once in total.
      - AC-4: every listed column is present after generation.
      - AC-5/EC-10/NFR-4: store a good tour, then make the next generation throw before output (fake `getRankedFiles` throws). `json` is byte-identical (compare a canonical form; jsonb key order, server INSIGHTS 2026-09-20) and the state shows `last_failure.reason`. Repeat with the failure injected at each stage: facts, LLM error, invalid output.
      - AC-6: facts collected while the LLM mock throws if called (degraded index), and `getRepoFacts` output reaches the stored skeleton (stack, structure, routes, commands).
      - AC-9: the fake hotness has `applied: false` with history numbers. The order equals pure PageRank order and the stored tour carries the note with the history size.
      - AC-13: exactly one call. Its user message contains the marker excerpt of a top file, not the marker of a file outside the top 30.
      - AC-14/EC-1: 200 ranked files give input tokens ≤ 24 000 (re-count with the real tokenizer) and `files_considered`/basis text with real N and M.
      - AC-15/EC-7: `throwOnStructured` with a schema-validation error gives 1 call, a stored `skeleton` with `invalid_output` + reason. A valid-schema fixture with missing grounding also gives the right section states.
      - AC-16/EC-8: a quota error (`status: 429`) gives 1 call (transport retries disabled), `skeleton`/`llm_unavailable`.
      - AC-17/EC-2: index `degraded` gives 0 calls and the status names the degraded state; repeat for `failed` and not built.
      - AC-23: 3-5 tasks each citing an indexed file; no fetch other than via the mock LLM; the github override is never called.
      - AC-25: the skeleton has every deterministic part populated plus `requires_generation` markers.
      - AC-31/NFR-3d: no route or job runs a command. Assert that `server/src/modules/onboarding/**` source contains no `child_process`/`execa`/`spawn` import (fs read of the module dir), and that `container.jobs` received no enqueue.
      - AC-36: one log record per attempt, for generated, skeleton (LLM error), skeleton (degraded, `llm_calls: 0`) and failed, each with every listed field (spy on the injected logger).
      - NFR-1: call counts 1, 1, 1, 0 across generated, malformed, LLM-error and degraded.
      - NFR-3: a README with "ignore previous instructions" lands only inside `<untrusted>`; an LLM fixture with `<script>`, an invented path and an invented command is neutralised or dropped; a repo of another workspace gives 404 on GET and POST.
      - NFR-5: a unique marker in a file excerpt is absent from every logger call.
      - EC-14: delete the repo while a delayed generation runs. The generation ends `failed`, there is no `onboarding` row, and one log record exists.
      - Facade integration (AC-7 DB side, C5): seed `file_rank` rows with an equal pagerank; `getRankedFiles` returns path-asc ties, and importer counts match `file_edges`.
      - NFR-2 (SHOULD): a 5 000-file fake facade over 20 runs, with p95 of the deterministic stage < 5 s and the whole run < 60 s with a 0 s mock. The 30 s-delay variant may be `.skip`ped on CI with a reported reason. It is not deferred.
    - Use `vi.waitFor` where reads follow async completion. Check the vitest summary's skipped count (Docker).
    - **Governed by:** `onion-architecture` `rules/testing.md` (fakes for ports, `.it` lane), `fastify-best-practices` (`app.inject`), `drizzle-orm-patterns`, `security`.
    - **Owner:** test-writer.

14. [wave 4, after 4, 8, 12] Colocated client tests:
    - `client/src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/OnboardingTourView.test.tsx`
    - `…/OnboardingTourView/_components/RunLocallySection/RunLocallySection.test.tsx`
    - `…/_components/SectionNav/SectionNav.test.tsx`
    - `…/_components/ArchitectureSection/ArchitectureSection.test.tsx`
    - `client/src/vendor/ui/primitives/Markdown.test.tsx`
    - `client/src/lib/hooks/onboarding-tour.test.tsx`

    Cases come from the ACs' `Verify:` hints; fixtures are built from the step 1 contract:
    - AC-27: `payments-api` with 12 files renders the header and the "Generated from index of 12 files · last refreshed …" line.
    - AC-28/NFR-6a: five cards in order, each toggles by click and by keyboard (Enter on the focused button); nav click calls the mocked `scrollIntoView` and marks the entry active.
    - AC-29: the Open link has the stored commit, `target=_blank` and `rel` containing `noopener`.
    - AC-30: copy calls the mocked `navigator.clipboard.writeText` with the exact command.
    - AC-31: the notice is present whenever commands are shown.
    - AC-32: `abc1234` vs `def5678` shows both ids; equal ids give no note.
    - AC-33: loading, error (with retry), empty (with CTA) and generating (no Generate/Regenerate button) each show their own text.
    - AC-1: rendering the empty state never calls POST.
    - AC-26/NFR-6c: badge text for "Generated" and each skeleton reason, as text.
    - AC-24/AC-25: "Not available: <reason>" and "Requires generation".
    - AC-19: mock `mermaid` (`parse` → false); the prose renders, no diagram, no error thrown.
    - AC-35: `<script>` stays text and does not execute; `javascript:` and non-allowlisted links render as plain text; an allowlisted path becomes the GitHub link (Markdown primitive with `transformHref`, plus no-prop behaviour unchanged).
    - AC-37: the footer shows model, tokens and cost.
    - AC-5: the `last_failure` notice renders next to the kept tour.
    - AC-34: covered by step 3's nav test.
    - NFR-6b: accessible names include the command or path.
    - Hook: `refetchInterval` is active only while `generating`; a 409 invalidates the state.

    Use `fireEvent`, not user-event. Include the `onboarding` namespace in test messages. Stub `IntersectionObserver` and `scrollIntoView` (jsdom lacks them).
    - **Governed by:** `react-testing-library`, `frontend-architecture` (colocated placement).
    - **Owner:** test-writer.

### File ownership (per wave)
| Wave | Step | Files owned |
|---|---|---|
| 1 | 1 | `server/src/vendor/shared/contracts/onboarding-tour.ts`, `server/src/vendor/shared/index.ts`, `server/src/vendor/shared/adapters.ts`, `client/src/vendor/shared/contracts/onboarding-tour.ts`, `client/src/vendor/shared/index.ts`, `client/src/vendor/shared/adapters.ts` |
| 1 | 2 | `server/src/db/schema/context.ts`, `server/src/db/migrations/**` (generated only) |
| 1 | 3 | `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/nav.test.ts` |
| 1 | 4 | `client/src/vendor/ui/primitives/Markdown.tsx`, `client/src/components/showcase/Showcase.tsx` |
| 2 | 5 | `server/src/adapters/git/simple-git.ts`, `server/src/adapters/llm/openai.ts`, `server/src/adapters/llm/anthropic.ts`, `server/src/adapters/mocks.ts`, `server/test/adapters.test.ts` (one trivial case) |
| 2 | 6 | `server/src/modules/repo-intel/{types,service,repository,constants}.ts`, `server/src/modules/repo-intel/pipeline/facts.ts` |
| 2 | 7 | `server/src/modules/onboarding/{constants,types,helpers,schemas,prompt,clone}.ts`, `server/src/prompts/onboarding.system.md` |
| 2 | 8 | `client/src/lib/hooks/onboarding-tour.ts`, `client/src/lib/hooks/index.ts` |
| 2 | 9 | `server/test/onboarding-helpers.test.ts`, `server/test/onboarding-prompt.test.ts`, `server/test/repo-intel-facts.test.ts` |
| 2 | 10 | `server/test/git-history-churn.test.ts` |
| 3 | 11 | `server/src/modules/onboarding/{service,repository,routes,index}.ts`, `server/src/platform/container.ts`, `server/src/modules/index.ts` |
| 3 | 12 | `client/src/app/repos/[repoId]/onboarding/**` (excluding `*.test.tsx`), `client/messages/en/onboarding.json` |
| 4 | 13 | `server/test/onboarding.it.test.ts` |
| 4 | 14 | the six client `*.test.tsx` files listed in step 14 |

No file appears twice within a wave. The cross-package contract change (contracts + ports) sits entirely in step 1.

### Spec coverage
| ID | Priority | Step(s) | Test owner |
|---|---|---|---|
| AC-1 | MUST | 8, 11, 12 | test-writer 13, 14 |
| AC-2 | MUST | 8, 11, 12 | test-writer 13 |
| AC-3 | MUST | 5, 8, 11 | test-writer 13 |
| AC-4 | MUST | 1, 2, 11 | test-writer 13 |
| AC-5 | MUST | 2, 7, 11, 12 | test-writer 9, 13, 14 |
| AC-6 | MUST | 6, 11 | test-writer 9, 13 |
| AC-7 | MUST | 6, 7 | test-writer 9, 13 |
| AC-8 | MUST | 5, 6, 7 | test-writer 9, 10 |
| AC-9 | MUST | 5, 6, 7, 12 | test-writer 9, 10, 13 |
| AC-10 | MUST | 7 | test-writer 9 |
| AC-11 | MUST | 6, 7, 12 | test-writer 9 |
| AC-12 | MUST | 7, 12 | test-writer 9 |
| AC-13 | MUST | 7, 11 | test-writer 9, 13 |
| AC-14 | MUST | 7, 11, 12 | test-writer 9, 13 |
| AC-15 | MUST | 5, 7, 11 | test-writer 9, 13 |
| AC-16 | MUST | 1, 5, 7, 11 | test-writer 9, 13 |
| AC-17 | MUST | 7, 11 | test-writer 9, 13 |
| AC-18 | MUST | 7, 11 | test-writer 9 |
| AC-19 | MUST | 7, 12 | test-writer 9, 14 |
| AC-20 | MUST | 6, 7, 12 | test-writer 9 |
| AC-21 | MUST | 7, 11 | test-writer 9 |
| AC-22 | SHOULD | 6, 7, 12 | test-writer 9 |
| AC-23 | MUST | 7, 11, 12 | test-writer 9, 13 |
| AC-24 | MUST | 7, 12 | test-writer 9, 14 |
| AC-25 | MUST | 6, 7, 11, 12 | test-writer 9, 13, 14 |
| AC-26 | MUST | 1, 12 | test-writer 14 |
| AC-27 | MUST | 1, 2, 12 | test-writer 14 |
| AC-28 | MUST | 12 | test-writer 14 |
| AC-29 | MUST | 12 | test-writer 14 |
| AC-30 | MUST | 12 | test-writer 14 |
| AC-31 | MUST | 11, 12 | test-writer 13, 14 |
| AC-32 | MUST | 1, 2, 7, 12 | test-writer 14 |
| AC-33 | MUST | 8, 12 | test-writer 14 |
| AC-34 | SHOULD | 3 | implementer inline (step 3) |
| AC-35 | MUST | 1, 4, 7, 12 | test-writer 9, 14 |
| AC-36 | MUST | 11 | test-writer 13 |
| AC-37 | COULD | 1, 2, 12 | test-writer 14 |
| EC-1 | — | 6, 7, 11 | test-writer 13 |
| EC-2 | — | 6, 11 | test-writer 13 |
| EC-3 | — | 5, 6 | test-writer 10, 13 |
| EC-4 | — | 7, 12 | test-writer 9 |
| EC-5 | — | 6, 12 | test-writer 9 |
| EC-6 | — | 7 | test-writer 9 |
| EC-7 | — | 7, 11 | test-writer 13 |
| EC-8 | — | 5, 7, 11 | test-writer 13 |
| EC-9 | — | 11 | test-writer 13 |
| EC-10 | — | 7, 11 | test-writer 13 |
| EC-11 | — | 12 | test-writer 14 |
| EC-12 | — | 6, 7, 12 | test-writer 9 |
| EC-13 | — | 6, 7, 12 | test-writer 9, 13 |
| EC-14 | — | 2, 11 (OQ-4: cascade + caught FK failure) | test-writer 13 |
| NFR-1 | MUST | 1, 5, 7, 11 | test-writer 13 |
| NFR-2 | SHOULD | 6, 11 | test-writer 13 (30 s variant may be CI-skipped, reported) |
| NFR-3 | MUST | (a) 7; (b) 4, 7, 12; (c) 6, 7; (d) 11, 12; (e) 11 | test-writer 9, 13, 14 |
| NFR-4 | MUST | 2, 7, 11 | test-writer 9, 13 |
| NFR-5 | MUST | 7, 11 | test-writer 13 |
| NFR-6 | SHOULD | 12 | test-writer 14 |

Every MUST row has an implementing step and a non-deferred test owner. The only implementer-inline coverage is AC-34 (trivial registry assertion).

### Skills the implementer will invoke
These come from `pr-self-review` Phase 4 (loaded at plan time; not copied here).
- **server modules, platform, adapters, db** (steps 2, 5, 6, 7, 11): `onion-architecture`.
  - Also `fastify-best-practices` for `onboarding/routes.ts` and `modules/index.ts` (step 11).
  - Also `drizzle-orm-patterns` for `db/**`, `repo-intel/repository.ts` and `onboarding/repository.ts` (steps 2, 6, 11).
  - Also `postgresql-table-design` for `db/schema/context.ts` and the generated migration (step 2; the migration also trips pr-self-review's phase-3 gate).
- **zod:** `**/vendor/shared/**` and files importing `zod` (steps 1, 7 `schemas.ts`, 11 routes).
- **client non-vendor** (steps 8, 12): `frontend-architecture`, `react-best-practices`, `next-best-practices`.
- **client vendored UI** (steps 3, 4): `frontend-architecture` (barrel rule, Showcase entry).
- **client tests** (step 14 and the trivial nav test in step 3): `react-testing-library` + `frontend-architecture`.
- **every `*.ts`/`*.tsx`:** `typescript-expert`, `security`.
- **`client/messages/**`** (step 12): no skill; single locale `en`, so keep key parity.
- **`server/src/prompts/*.md`** (step 7): no routed skill; `security` applies to its content (injection guard).

### Verification scope
- **After each wave:** `bash scripts/verify-changed.sh`. Touched packages only:
  - server and client: typecheck + `vitest related` (server unit lane);
  - `pnpm arch:check`, which runs because `server/src/{modules,platform,adapters,db}` changed. The baseline must not grow; in particular, `repo-intel/service.ts` must not gain an `adapters/**` import;
  - `check-vendor-shared-sync.sh` (wave 1, step 1).
- **After step 2:** `cd server && pnpm db:generate`. Review that the SQL is ADD COLUMN only, with no DROP. The user runs `pnpm db:migrate`.
- **After wave 4:** `cd server && pnpm exec vitest run test/onboarding.it.test.ts` (Docker). The skipped count must be 0, or the run is re-done once Docker responds.
- **Once at the end:** `bash scripts/verify-changed.sh --full` for `server` (unit lane, including `adapters.test.ts`, `repo-intel-*.test.ts`, `onboarding-*.test.ts`, `git-history-churn.test.ts`, `routes-smoke.test.ts`) and `client` (nav, Markdown, onboarding view, hooks, showcase smoke).
- **Windows note:** the 6 known `indexer-pipeline.test.ts` failures are pre-existing.
- reviewer-core, mcp-server and e2e are untouched, so they are not run. No full repo suite by default.

### Explicitly out of scope
For `architecture-reviewer`:
- whether `getRepoFacts`'s fs walk and file reads belong in the repo-intel facade or in a new port/adapter (the facade already reads the clone via `readClone`; baseline debt);
- the duplicated exclusion list (C7);
- whether `clone.ts` (onboarding fs edge, brief precedent) should become an adapter;
- whether classifying LLM errors by message (`classifyLlmError`) should become a typed error in `platform/errors.ts`;
- whether `StructuredRequest.transportRetries` is the right port shape.

For `security-reviewer`:
- the `neutralizeMarkdown` / `sanitizeDiagram` allowlists;
- displaying hostile repository commands (inert text + notice);
- the absence of a per-minute rate limit on generate (recommendation 6);
- symlink/TOCTOU between walk and read;
- README fence parsing caps;
- whether the error `detail` string stored for `llm_unavailable` can leak provider internals.

Also deferred: C1 final semantics (spec owner), OQ-2 (deepened fetch), the legacy `Onboarding` contract cleanup, and the C10 nav-highlight quirk.

### Open questions / assumptions
**Assumptions adopted** because `AskUserQuestion` was unavailable. The user can veto each one before `Status: approved`.
- **Spec status:** planned against a `draft` spec on the user's explicit instruction.
- **OQ-1:** top **30** ranked files, **2 KB** excerpt per file, **24 000** input tokens total (`onboarding/constants.ts`).
- **OQ-2:** no deepened fetch. Hotness uses whatever history the checkout has (clone depth 1, resync depth 50). It is applied only when the history covers the 90-day window or the clone is not shallow; otherwise the tour says "not applied" with the commit and day counts.
- **OQ-3:** Open links to `https://github.com/<full_name>/blob/<indexed_sha>/<path>` in a new tab with `rel="noopener noreferrer"`.
- **OQ-4:** route `/repos/[repoId]/onboarding`, distinct from the add-repo `/onboarding`. The tour is deleted with the repo (existing `ON DELETE CASCADE`). A generation racing a delete ends `failed` with no row.
- **OQ-5:** the prompt template and `onboarding.json` are replaced by the five sections.
- **OQ-6:** the existing per-workspace `onboarding` feature model (default `openrouter` / `deepseek/deepseek-v4-flash`).
- **OQ-7:** the NFR-2 targets as stated; the 30 s-provider variant may be CI-skipped with a reported reason.
- **OQ-8:** unseen design parts (First tasks, skeleton, stale note, generating state) follow the existing card style.
- **OQ-9:** only AC-37's footer is built; no "copy all", no mini map.
- **C1** persistence rule (above). **C9** hotness anchored at the indexed commit's date. Critical paths use PageRank order (recommendation 3). Fewer than 3 grounded First tasks gives "Not available" (recommendation 2). Env/compose commands are derived (recommendation 7).
- **Generation is synchronous** (brief precedent). The POST returns when done, up to about 45 s plus facts. Other tabs see `generating` via GET polling. The guard is in-process only, which is correct for this single-process local-first server; a multi-process deployment would need a DB lease (noted, not built).
- **Nav:** key `onboarding-tour` (matches the existing `activeKeyFor`), icon `Layers`, no `g` shortcut, in WORKSPACE after Pull Requests and Project Context.

**Unresolved (no plan impact):** whether the spec owner prefers "skeleton always replaces" (literal AC-15/AC-16) over the C1 default. If so, only `decidePersistence` and its tests change.
