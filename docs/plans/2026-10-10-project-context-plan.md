# Development Plan: Project Context (SPEC-01)
Spec: specs/2026-10-10-project-context.md
Status: approved

## Development Plan: Project Context — discover, attach, inject and trace repository Markdown documents

### Requirements review
**Source reviewed:** `specs/2026-10-10-project-context.md` (SPEC-01, `Status: approved`; the user approved it before planning started), plus the code it cites. I checked the spec author's research against the code. It holds, with these extra findings:
- `server/src/modules/_shared/checkout-paths.ts` already provides `isRelativeSafePath`, `resolveContainedPath`, `ContainmentError` and `MissingPathError`. `modules/brief/clone.ts` is the pattern to follow for a containment-checked reader that the container injects as a port. `brief/constants.ts:43` already refers to a "project-context `MAX_DOC_BYTES`" of 256 KB.
- Every agent-launch path goes through one code path: run single, run all, and re-run all call `POST /pulls/:id/review`, then `ReviewService.runReview`, then `ReviewRunExecutor.executeRuns`, then `runOneAgent` (`reviews/service.ts:118-151`, `run-executor.ts:183`). The mcp-server `run_agent_on_pr` tool calls the same HTTP route. Injecting in `runOneAgent` therefore covers AC-31.
- `client/src/vendor/ui/nav.test.ts` asserts that the SKILLS LAB items are exactly `["skills","agents","conventions"]`. The new nav item therefore goes into the WORKSPACE section (next to Pull Requests, which is also repo-scoped), so the existing test does not break.
- `server/.dependency-cruiser.cjs` treats only files named `service|run-executor|helpers|status|constants|findings|diff-loader` and `pipeline/` as INNER (server `INSIGHTS.md` 2026-09-30). New pure logic must therefore live in `helpers.ts`, or arch-check won't cover it.
- `ModelInfo.contextLength` exists (`vendor/shared/adapters.ts:26`). `PriceBook` already caches OpenRouter `/models` but throws `contextLength` away. That gives a way to derive a budget with no extra call (see OQ-1 below).
- The vendored `@devdigest/shared` copies are byte-identical today (`diff -r` is clean), so a mirror by whole-file copy is safe.
- `client/src/vendor/ui/primitives/Markdown.tsx` uses `react-markdown` + `remark-gfm` without `rehype-raw`. Raw HTML is escaped to text, and the default `urlTransform` strips `javascript:` URLs. That covers AC-4 and NFR-4c, provided no one adds `rehype-raw`.

**Clarifications:** `AskUserQuestion` is not available to this planner session. I did not stop: I adopted the assumption or proposal theArro caller and spec state for each open question that affects the plan. Each one is listed under "Open questions / assumptions" so the user can veto it before setting `Status: approved`.

**Recommended improvements to the spec** (for the spec owner; the spec itself was not edited):
1. *Non-blocking.* AC-29 puts the document path inside `source="…"`. A repository path can contain `"`, `<`, `>` or a newline, which would break the attribute. Recommend the spec state that labels are sanitized. **Adopted in the plan** (step 1): the label is escaped. Path text in the trace is unchanged.
2. *Non-blocking.* AC-6 says "added … through a linked skill" but does not say whether disabled or flagged skills count, or disabled agents. **Assumed:** a skill counts only if it is enabled and not injection-flagged (the same rule as AC-16). All agents count, enabled or not, because a disabled agent can still be run explicitly (server `INSIGHTS.md` 2026-09-19).
3. *Non-blocking.* AC-23 (the API total matches exactly) and AC-25/NFR-2 (the total updates within the same render, ≤ 200 ms) pull in different directions: BPE token counts are not exactly additive. **Adopted:** the server returns the exact total plus per-document block tokens and a fixed overhead. The client shows an "≈" estimate (heading + Σ per-document tokens + separators) instantly after a toggle or reorder, then replaces it with the server's exact total once the save resolves.
4. *Non-blocking.* AC-5 refresh runs `git fetch` + `reset --hard` synchronously, so it could race with a repo-intel index or resync job on the same checkout. Recommend the spec owner decide whether refresh should enqueue the existing `REFRESH_JOB_KIND` instead. **Assumed:** synchronous `GitClient.sync`, rate-limited. Runs are unaffected because they read documents once at their start (AC-28).
5. *Non-blocking.* AC-33 lists three skip reasons. A whitespace-only document (AC-36) gets no reason code. **Assumed:** it is skipped silently in the prompt and the trace, and counted only in the NFR-6 log counter `skipped`.
6. *Non-blocking.* AC-9 together with editing existing attachments: if a previously attached document is later deleted or grows past the limit, a strict "reject non-discoverable paths" rule would make reorder or detach impossible. **Adopted:** only *newly added* paths must be discoverable and within the limit. Paths that are already attached may be kept, reordered or removed (this mirrors the flagged-skill link exemption, server `INSIGHTS.md` 2026-09-20).
7. *Non-blocking.* The design shows no Save button, while AC-10, AC-11 and AC-12 require state to persist on enable, disable and reorder. **Adopted:** immediate save, optimistic, against a save-agnostic "replace the ordered list" API (OQ-7).

**Execution mode:** single-agent. `AskUserQuestion` is unavailable, so the user could not be asked; the caller's instruction and the agent rules both default to single-agent in that case. No subagents were used.

**Test authorship for this run:** the user executes the plan with `/run-plan`, which skips `test-writer`. Steps 15-17 are owned by `test-writer` as the rules require and are marked **[DEFERRABLE — skipped by /run-plan]**. Implementer-owned tests are kept to the minimum trivial cases listed inline.

### Scope
This plan implements SPEC-01 end to end:
- **Discovery.** View-only discovery and Markdown preview of `*.md` files under `specs/`, `docs/` and `insights/` in a repository's synced default-branch checkout. Includes the refresh action and per-document token counts and usage counters.
- **Attachments.** Attaching documents to agents and skills, with order. Storage is per (repository, path), and an agent inherits its skills' documents.
- **Run-time injection.** One read at run start; ordering and de-duplication; skip, budget-drop and containment rules; labelled untrusted blocks rendered by one shared reviewer-core renderer.
- **Trace transparency.** Documents, tokens, full text stored in the trace, skipped and dropped lists, and Specs read.
- **New page and navigation.** The Project Context page, the nav entry, and Context tabs in the agent and skill editors.

It does **not** cover:
- editing, uploading or creating documents (OQ-6), Coverage (OQ-8), the "Indexed chunks" footer (OQ-9), or rename tracking (OQ-10);
- versioning attachments with agent or skill versions (EC-14 / OQ-7 — attachments are not part of `agent_versions`/`skill_versions` snapshots);
- provider-specific tokenizers (OQ-11), CI-runner parity (OQ-13), the OQ-14 UX ideas, Onboarding Tour changes, and e2e browser flows.

### Modules affected
- **reviewer-core.** `prompt.ts` and `review/run.ts`: a path-labelled `ProjectDoc` input and an exported `renderProjectContext()`. This is the single renderer used by the prompt, the server's token totals and the skill "Serializes as" preview (AC-19, AC-23, AC-29, AC-30, AC-32).
- **server.**
  - A new `project-context` module covering discovery, reading, attachments, totals and run-time resolution.
  - New schema tables and a generated migration.
  - Vendored contracts.
  - `PriceBook` (context-window lookup).
  - Container wiring and module registry.
  - `reviews/run-executor.ts`, which injects documents and writes trace and logs.
- **client.**
  - Vendored contracts mirror.
  - New data hooks, replacing the dead `useContextFiles`/`useReindexContext`.
  - A new `/repos/[repoId]/context` page plus a shared doc-preview component.
  - Context tabs in the agent and skill editors.
  - The run-trace Prompt Assembly row.
  - The nav entry in vendored `vendor/ui/nav.ts`.
  - i18n files.
- **e2e / mcp-server.** Not touched.

### Architectural constraints
- **Root `AGENTS.md`:** contracts are vendored and must be mirrored by hand between `server/src/vendor/shared` and `client/src/vendor/shared`. Migrations never run on boot, so the user runs `cd server && pnpm db:migrate`. Never touch `server/clones/**`.
- **`server/AGENTS.md`:**
  - Onion layering: routes, then service, then ports. Only repositories touch Drizzle. Services take explicit deps, not the whole `Container`. `pnpm arch:check` must pass and the baseline may only shrink.
  - Integration tests must end in `*.it.test.ts`.
  - `src/db/migrations/*` are generated, never hand-edited.
- **`server/INSIGHTS.md`:**
  - A new `db/schema/<x>.ts` must be exported from the `db/schema.ts` barrel *before* `pnpm db:generate`, or drizzle-kit generates a DROP (2026-09-20).
  - Pure logic goes in a file named `helpers.ts`/`constants.ts` so arch-check covers it (2026-09-30).
  - Do not read `container.config` unguarded in the run hot path, and do not tokenize the whole prompt per run (2026-09-24). Use `this.container.config?.…`, and tokenize only the project-context block.
  - Vendored-contract mirroring with the `Write` tool can flip CRLF to LF. Prefer `Edit`, or normalize line endings, then run `scripts/check-vendor-shared-sync.sh` (2026-09-24).
  - Side effects written after a run reaches `done` (trace, skills) need `vi.waitFor` in integration tests (2026-09-20).
  - The checkout tracks the default branch, not the PR head (2026-10-09).
- **`server/src/modules/_shared/checkout-paths.ts`:** every document read goes through `resolveContainedPath`. `ContainmentError` maps to `refused_containment`, `MissingPathError` to `missing`, and any other error to `unreadable`.
- **`reviewer-core/AGENTS.md`:** no DB, GitHub or filesystem access. `typecheck` is the build. **`reviewer-core/INSIGHTS.md`** (2026-09-24): when the new input is absent, the assembled prompt must stay byte-identical. Keep the field optional through `ReviewInput`, `promptParts` and `assemblePrompt`, and never default it to `[]`.
- **`client/AGENTS.md` and `client/INSIGHTS.md`:**
  - Import UI only from the `@devdigest/ui` barrel.
  - Components never `fetch`; data comes through `lib/hooks/*`.
  - `vendor/ui/**` edits must be deliberate. The nav edit is one item; nav is not a component, so it needs no Showcase entry.
  - `messages/en/*.json` files are auto-loaded namespaces.
  - `@testing-library/user-event` is not installed; use `fireEvent`.
  - `Toggle`/`Checkbox` have no `disabled` prop.
  - `Modal` is not a portal; render dialogs as siblings.
  - In the Skills tab pattern, list order equals prompt order and drag is disabled while a filter is active.
  - Agent edits have produced cp1252 `0x97` bytes and CRLF churn before; check non-ASCII text such as the "≈" and "—" characters.
- **`client/src/vendor/ui/AGENTS.md`:** barrel-only imports. Nav lives in vendored `nav.ts`, and its `nav.test.ts` asserts the SKILLS LAB membership.
- **`TESTING.md`:** typological testing. Mock LLM, GitHub and git via `adapters/mocks.ts`. One real integration per data-backed workflow.

### Steps
Steps marked **[DEFERRABLE — skipped by /run-plan]** are owned by `test-writer` and can run in a later pass.

**Wave 1 — foundations (disjoint files, no inter-dependencies)**

1. [wave 1] `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts`, `reviewer-core/src/index.ts`, `reviewer-core/test/prompt.test.ts`
   - **What changes:**
     - Add `export interface ProjectDoc { path: string; content: string }`.
     - Add `export const PROJECT_CONTEXT_HEADING = '## Project context'`.
     - Add `export function renderProjectDocBlock(doc): string`, which returns `wrapUntrusted(label, content)` with label `project-doc:<path>`. `"`, `<`, `>` and CR/LF in the path are escaped or replaced in the label only.
     - Add `export function renderProjectContext(docs: ProjectDoc[]): string | null`, which returns `null` for an empty list. Otherwise it returns the heading + `\n` + the per-document blocks joined by `\n\n`, i.e. exactly the user section.
     - Add optional `PromptParts.projectDocs?: ProjectDoc[]` and `ReviewInput.projectDocs?`, threaded through `promptParts` in `run.ts`. Never default it.
     - In `assemblePrompt`: when `projectDocs` is non-empty, the `## Project context` section comes from `renderProjectContext`, in the same position as today, and `assembly.specs` is the block body without the heading. Otherwise the legacy `specs` path stays unchanged, keeping the external CI runner compatible.
     - Export the new symbols from `index.ts`.
     - Map-reduce keeps re-assembling per chunk; the same `projectDocs` strings go to every chunk.
   - **Implements:** AC-19 (single renderer), AC-27, AC-29, AC-30 (reuses `wrapUntrusted` neutralization), AC-32, AC-28 (engine side), EC-5.
   - **Governed by:** `onion-architecture` (reviewer-core stays pure: no fs, no tokenizer; the server counts tokens), `typescript-expert`, `security` (label escaping and closing-tag neutralization).
   - **Owner:** implementer. Trivial inline test: one AC-32 case asserting that `assemblePrompt` without `projectDocs` returns the same `user` string as with `projectDocs: undefined`.

2. [wave 1] `server/src/vendor/shared/contracts/project-context.ts` (new), `server/src/vendor/shared/contracts/trace.ts`, `server/src/vendor/shared/index.ts`, and the same three files mirrored in `client/src/vendor/shared/`
   - **New contracts:**
     - `ProjectDocRoot` = enum `specs|docs|insights`.
     - `ProjectDocSkipReason` = enum `missing|unreadable|too_large|over_budget|refused_containment`.
     - `ProjectDocListItem` `{ path, root, size_bytes, tokens: int|null, too_large: boolean, used_by_agents: int }`.
     - `ProjectDocList` `{ repo_id, roots: ProjectDocRoot[], docs: ProjectDocListItem[] }`.
     - `ProjectDocContent` `{ path, root, content, tokens }`.
     - `ContextAttachmentRow` `{ path, root, tokens: int|null, state: 'ok'|'missing'|'too_large'|'unreadable'|'refused_containment' }`.
     - `InheritedContextRow` `{ path, tokens: int|null, skill_id, skill_name, duplicate: boolean }`.
     - `ContextOverhead` `{ heading_tokens, separator_tokens }`.
     - `AgentContextState` `{ repo_id, discovered_count, attached: ContextAttachmentRow[], inherited: InheritedContextRow[], total_tokens, budget_tokens, dropped: {path, reason}[], overhead: ContextOverhead }`.
     - `SkillContextState` `{ repo_id, discovered_count, attached, total_tokens, serialized: string|null, overhead }`.
     - `SetContextDocsBody` `{ repo_id: uuid, paths: string[] }`: max 100 items, unique (refine), each path 1..512 chars.
     - `ContextRepoQuery` `{ repo_id: uuid }`.
     - `ProjectDocQuery` `{ path: string 1..512 }`.
   - **`trace.ts`:**
     - Add `ProjectContextTrace` `{ docs: {path, tokens, text}[], skipped: {path, reason: ProjectDocSkipReason}[], total_tokens: int, budget_tokens: int }`.
     - Add `RunTrace.project_context: ProjectContextTrace.optional()` so old traces still parse (AC-43).
   - **Mirroring:** copy whole files to the client and normalize CRLF to match the existing files.
   - **Implements:** AC-1, AC-6, AC-9, AC-13, AC-20, AC-23, AC-24, AC-26, AC-33, AC-34, AC-35, AC-38, AC-39, AC-40, AC-43, NFR-4e (body limits).
   - **Governed by:** `zod`, `onion-architecture` (shared kernel: envelope shapes stay at the edge), `typescript-expert`, `security`. This is the single owner of the cross-package contract change.
   - **Owner:** implementer.

3. [wave 1] `server/src/db/schema/project-context.ts` (new), `server/src/db/schema.ts`, `server/src/db/migrations/<generated>` (+ drizzle meta journal/snapshot)
   - **`agent_context_docs`:**
     - Columns: `agent_id` (uuid FK→agents, cascade), `repo_id` (uuid FK→repos, cascade), `path` (text), `order` (integer not null default 0), `created_at` (`now()` helper).
     - PK `(agent_id, repo_id, path)`.
     - Index `(repo_id, path)` for AC-6 usage counts.
   - **`skill_context_docs`:** the same shape with `skill_id` FK→skills, cascade.
   - **Wiring:** re-export from the `db/schema.ts` barrel and add the tables to the `schema` object *before* running `cd server && pnpm db:generate`. Never hand-edit the SQL. Workspace scoping comes through the agent, skill and repo FKs, all workspace-owned; the repository enforces it.
   - **Implements:** AC-10, AC-11, AC-12, AC-15, AC-21.
   - **Governed by:** `drizzle-orm-patterns`, `postgresql-table-design` (FK columns indexed; the composite PK's leading column covers `agent_id`/`skill_id`; add an explicit index on `repo_id`), `onion-architecture`.
   - **Owner:** implementer.

4. [wave 1] `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/nav.test.ts`
   - **What changes:** add `{ key: "context", label: "Project Context", icon: "FileText", href: "/repos/:repoId/context" }` to the **WORKSPACE** section. Add no `gKey`, so the shortcut registry stays untouched.
   - **Implements:** entry point for AC-1.
   - **Governed by:** `frontend-architecture` (vendored UI, deliberate edit).
   - **Owner:** implementer. Trivial inline test: assert the item exists in WORKSPACE and `resolveHref` gives `/repos/r/context`. The existing SKILLS LAB assertion must still pass.

**Wave 2 — server building blocks + client data/trace (after wave 1)**

5. [wave 2, after 2] `server/src/modules/project-context/constants.ts`, `types.ts`, `helpers.ts`, `checkout.ts` (all new)
   - **`constants.ts`:**
     - `PROJECT_DOC_ROOTS = ['specs','docs','insights']`.
     - `MAX_DOC_BYTES = 256 * 1024`.
     - `MAX_DISCOVERED_DOCS = 2000` (safety cap).
     - `IGNORED_DIRS = ['node_modules','.git']`.
     - `BUDGET_FALLBACK_TOKENS = 16_000`, `BUDGET_CONTEXT_RATIO = 0.2`, `BUDGET_MIN_TOKENS = 4_000`, `BUDGET_MAX_TOKENS = 32_000`.
     - `MAX_ATTACHMENTS = 100`.
   - **`types.ts` (ports):**
     - `ProjectContextRepoPort` (the methods step 6 implements).
     - `CheckoutReader` `{ discover(clonePath), read(clonePath, path) }`.
     - `CheckoutSyncer` `(ref, branch) => Promise<void>`.
     - `ContextWindowLookup` `(provider, model) => number | null`.
     - `TokenCounter` `{ count(text): number }`.
     - `ProjectContextResolver` / `RunProjectContext` result types: `{ docs: ProjectDoc[]; trace: ProjectContextTrace; counts: {attached, added, skipped, dropped}; blockTokens }`.
   - **`helpers.ts` (pure):**
     - `rootOf(path)`.
     - `isProjectDocPath(path)`: `isRelativeSafePath` + under a root + `.md` (case-insensitive) + no ignored dir segment.
     - `orderAndDedupe(own, skills[])`: own first, then skill order, then in-skill order; first occurrence wins (AC-17, AC-18).
     - `applyBudget(docs, countBlock, budget)`: drop whole documents from the end until `countBlock(remaining) ≤ budget`. If none fit, the result is empty and every document is recorded as `over_budget` (AC-34, EC-13).
     - `computeBudget(contextLength | null)` = `clamp(floor(ctx × ratio), min, max)`, or the fallback when unknown (OQ-1).
     - `isBlank(text)` (AC-36).
     - `estimateTotal(overhead, tokens[])` for parity with the client estimate.
   - **`checkout.ts` (fs edge, same pattern as `brief/clone.ts`):**
     - `discover(clonePath)` walks only the three roots with `lstat`. It never follows directory symlinks and skips `IGNORED_DIRS`. It keeps `*.md` files and caps at `MAX_DISCOVERED_DOCS`. File symlinks are checked via `resolveContainedPath`; escaping ones are excluded from the list.
     - It returns POSIX relative paths (Windows `relative()` yields backslashes, so normalize — server `INSIGHTS.md` 2026-10-07) with their sizes.
     - `read(clonePath, path)` uses `resolveContainedPath`, then `stat`. If the size is over `MAX_DOC_BYTES` it returns `too_large` **without reading the content** (NFR-4d).
     - Otherwise it reads a Buffer and decodes with `TextDecoder('utf-8', { fatal: true })`. A NUL byte or a decode failure gives `unreadable`. Error mapping: `ContainmentError` gives `refused_containment`, `MissingPathError` gives `missing`.
     - Returns `{ ok: true, content } | { ok: false, reason }`.
   - **Implements:** AC-1, AC-2, AC-9, AC-17, AC-18, AC-22, AC-33, AC-34, AC-35, AC-36, EC-7, EC-8, EC-9, EC-10, EC-13, NFR-4a, NFR-4d.
   - **Governed by:** `onion-architecture` (pure rules in `helpers.ts` so `inner-no-outer` covers them; fs I/O stays in `checkout.ts`, which is injected as a port; no import from other modules), `security` (path traversal, symlinks, size limit, encoding), `typescript-expert`.
   - **Owner:** implementer.

6. [wave 2, after 3] `server/src/modules/project-context/repository.ts` (new)
   - **Every method is workspace-scoped:**
     - `getRepo(ws, repoId)` returns `{id, owner, name, defaultBranch, clonePath}`.
     - `getAgent(ws, id)` / `getSkill(ws, id)` return the id and name or `undefined`.
     - `agentDocs(agentId, repoId)` / `skillDocs(skillId, repoId)` return paths ordered by `order`.
     - `setAgentDocs(agentId, repoId, paths)` / `setSkillDocs(...)`: a transaction of delete plus insert, with `order = index`.
     - `activeSkillsForAgent(agentId)` returns linked skills where `enabled && !injectionDetected`, ordered by `agent_skills.order`. This is the same rule as `run-executor.resolveActiveSkills`.
     - `usageCounts(ws, repoId)` returns a `Map<path, number>`: distinct agents from direct rows UNION agents linked through `agent_skills` to an enabled, non-flagged skill that has the path in `skill_context_docs`.
   - Returns mapped domain types, never `$inferSelect`.
   - **Implements:** AC-6, AC-10, AC-11, AC-12, AC-15, AC-16, AC-21, NFR-4e.
   - **Governed by:** `drizzle-orm-patterns`, `onion-architecture` (only the repository touches Drizzle; mapper to domain shapes; optional `tx` param, with the transaction boundary owned by the service when needed), `postgresql-table-design`, `security` (workspace ownership on every lookup).
   - **Owner:** implementer.

7. [wave 2] `server/src/platform/price-book.ts`
   - **What changes:** in `ingest`, also store `m.contextLength` in a `Map`. Add a synchronous `contextLength(model): number | null`. It triggers the same lazy background refresh, and returns `null` when the cache is cold or the model is unknown (OpenAI/Anthropic).
   - **Implements:** OQ-1 budget source; NFR-3 (no LLM call; it reuses the existing cached `/models` list).
   - **Governed by:** `onion-architecture` (platform, no module imports).
   - **Owner:** implementer. Trivial inline test only if a `price-book.test.ts` case can be added by extending the existing file: one case that `contextLength` is returned after `refresh()`.

8. [wave 2, after 2] `client/src/lib/hooks/project-context.ts` (new), `client/src/lib/hooks/index.ts`, `client/src/lib/hooks/core.ts`
   - **Removed:** the dead `useContextFiles`/`useReindexContext` and their now-unused `SpecFile`/`IndexStatus` imports in `core.ts`.
   - **New hooks:**
     - `useProjectDocs(repoId)` — key `["project-docs", repoId]`.
     - `useProjectDoc(repoId, path)` — `["project-doc", repoId, path]`, enabled when `path` is set.
     - `useRefreshProjectDocs()` — POST refresh, then `setQueryData` on the list.
     - `useAgentContext(agentId, repoId)` / `useSetAgentContext(agentId)`.
     - `useSkillContext(skillId, repoId)` / `useSetSkillContext(skillId)`.
   - **Set-hook behaviour:** PUT the full ordered list, with an optimistic update of `attached` order and membership. On success, write the server state into the cache and invalidate `["project-docs", repoId]` (usage counters). Also invalidate every `["agent-context", …]` after a skill change, because inherited rows change (`client/INSIGHTS.md` 2026-09-18: invalidate every related key).
   - Re-export the hooks from `index.ts`.
   - **Implements:** AC-5, AC-10, AC-11, AC-12, AC-15, AC-25.
   - **Governed by:** `frontend-architecture` (hooks are the only data surface; `lib/api.ts` only), `react-best-practices` (no copying query data into state), `next-best-practices`, `typescript-expert`.
   - **Owner:** implementer.

9. [wave 2, after 2] `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/ProjectContextBlock/` (new: `index.ts`, `ProjectContextBlock.tsx`, `helpers.ts`), `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `client/messages/en/runs.json`
   - **When `trace.project_context` is present**, render a separate expandable row labelled "Project context — attached specs (untrusted)":
     - an untrusted badge, plus "N docs" and "≈ T tokens" badges;
     - a copy button that copies `prompt_assembly.specs` together with the heading (`helpers.ts` builds the full block text) — AC-42.
     - **Expanded:** the documents in injection order (path + tokens), each with an "Open full text" action opening a `Modal` (sibling, not nested) that shows the stored `text`. Below that, a separate list "Skipped / dropped" with path + reason label (text, not colour only).
   - **When `project_context` is absent** but legacy `prompt_assembly.specs` exists, keep the existing `PromptBlock`, so old traces render unchanged.
   - The "Specs read" row already renders `specs_read`; no change is needed beyond receiving data.
   - **Implements:** AC-37, AC-38, AC-40, AC-41, AC-42, AC-43, NFR-7c.
   - **Governed by:** `frontend-architecture` (sub-component in the drawer's `_components/`; pure label/format helpers in `helpers.ts`; strings in `runs.json`), `react-best-practices` (early-return states; stable keys = path), `next-best-practices`.
   - **Owner:** implementer.

**Wave 3 — server service + routes; client page (after wave 2)**

10. [wave 3, after 1, 5, 6] `server/src/modules/project-context/service.ts`, `server/src/modules/project-context/routes.ts`, `server/src/modules/project-context/index.ts` (all new)
    - **`ProjectContextService`** takes an explicit `Deps` (`repo: ProjectContextRepoPort`, `checkout: CheckoutReader`, `sync: CheckoutSyncer`, `tokenizer: TokenCounter`, `contextWindow: ContextWindowLookup`, `logger`). Never the `Container`.
    - It holds an in-memory token cache keyed by sha256(content), capped by LRU at about 5000 entries, so counts always follow the current content (AC-22) and the list stays fast (NFR-1).
    - **Methods:**
      - `list(ws, repoId)`:
        - 404 if the repo is not in the workspace.
        - If `clonePath` is null or the directory is missing, throw `AppError('checkout_unavailable', <reason>, 409)` (AC-8).
        - Otherwise discover, read each file within the limit to count `tokens = count(renderProjectDocBlock(doc))`, attach `used_by_agents`, and sort by path.
      - `getDoc(ws, repoId, path)`:
        - `isProjectDocPath` must pass, else 422. Read via `checkout`.
        - Reason mapping: `missing` gives 404, `too_large` 422, `refused_containment` 422, `unreadable` 422. Content is never included on refusal.
      - `refresh(ws, repoId)`: `sync({owner,name}, defaultBranch)`, then `list`. A sync failure throws `ExternalServiceError` with the reason (AC-5, AC-8).
      - `getAgentContext(ws, agentId, repoId)` and `setAgentContext(ws, agentId, repoId, paths)`:
        - Validate ownership of the agent and the repo.
        - Paths newly added versus the stored list must pass `isProjectDocPath`, be discovered and not `too_large`, else `ValidationError` 422 (AC-9). Already-attached paths are exempt.
        - Persist, then return the state.
      - `getSkillContext` / `setSkillContext`: same rules, plus `serialized = renderProjectContext(docs)` (AC-19).
      - **`resolveForRun({ workspaceId, repoId, agentId, provider, model, activeSkills? })`** — the single assembly pipeline, also used by `getAgentContext` so the total equals the run (AC-23):
        1. Own docs, then the docs of `activeSkills` (from the executor, or `repo.activeSkillsForAgent` for previews), via `orderAndDedupe`.
        2. Read each document **once**.
        3. Collect skips with reasons; drop blank documents silently.
        4. Budget is `computeBudget(contextWindow(provider, model))`. `applyBudget` counts the rendered block with the tokenizer.
        5. Return the docs, the trace object (`docs[].text` = exactly the content included), counts, and `blockTokens`.
        6. Log only counts, paths and token numbers, never content (NFR-5, NFR-6).
      - A checkout that is unavailable at run time yields every attachment as `missing`, not a thrown error, so the run continues (AC-33).
    - **`routes.ts`:** Zod schemas from step 2. Every handler is `getContext`, then one service call:
      - `GET /repos/:id/context`
      - `GET /repos/:id/context/file?path=`
      - `POST /repos/:id/context/refresh` (route `config.rateLimit` max 6 / minute)
      - `GET|PUT /agents/:id/context` (query/body `repo_id`)
      - `GET|PUT /skills/:id/context`
    - **`index.ts`:** public surface (types re-export).
    - **Implements:** AC-1, AC-2, AC-5, AC-6, AC-8, AC-9, AC-10, AC-11, AC-12, AC-15, AC-16, AC-17, AC-18, AC-19, AC-21, AC-22, AC-23, AC-24, AC-26, AC-28 (one read), AC-33, AC-34, AC-35, AC-36, NFR-1, NFR-3, NFR-4a, NFR-4d, NFR-4e, NFR-5.
    - **Governed by:**
      - `onion-architecture` — the route validates and makes one service call, with no adapter or Drizzle in the route; the service uses a Deps object of ports; the service calls the git sync only through the injected `CheckoutSyncer`; `AppError` family only.
      - `fastify-best-practices` — schema on the route, `withTypeProvider<ZodTypeProvider>()`, per-route rate limit.
      - `zod` — parse once at the boundary.
      - `security` — IDOR checks on agent, skill and repo per workspace; no content in errors or logs.
      - `typescript-expert`.
    - **Owner:** implementer.

11. [wave 3, after 8] `client/src/app/repos/[repoId]/context/page.tsx` (new, thin), `client/src/app/repos/[repoId]/context/_components/ProjectContextView/` (new: `index.ts`, `ProjectContextView.tsx`, `styles.ts`, `helpers.ts`, `constants.ts`, `_components/DocList/`), `client/src/components/project-context/DocPreview/` (new shared: `index.ts`, `DocPreview.tsx`, `styles.ts`), `client/messages/en/context.json` (rewrite)
    - **Page view:**
      - A refresh button (AC-5).
      - A list grouped or labelled by root, showing the path, a `root` badge, "≈ N tokens", "Used by N agents" and a text badge "Too large".
      - Selecting a row shows `DocPreview` in Preview mode, using `@devdigest/ui` `Markdown` (escapes raw HTML, strips `javascript:` — never add `rehype-raw`).
      - Separate early-return states:
        - loading;
        - error, including `checkout_unavailable` with the reason and an `ErrorState` retry button (AC-8);
        - empty, with text naming `specs/`, `docs/` and `insights/` (AC-7).
      - No Edit toggle and no upload or new-folder buttons (Non-goals).
    - **`DocPreview`** is shared: the page and both editor tabs use it, so it lives under `src/components/project-context/`. It fetches through `useProjectDoc`.
    - **`context.json`:** remove the `.devdigest/specs/` copy and the editor/save strings.
    - **Implements:** AC-1, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9 (marker), AC-26, NFR-4c, NFR-7b, NFR-7c.
    - **Governed by:** `frontend-architecture` (thin `page.tsx`; route `_components`; shared component promoted to `src/components/` because there are 3 consumers; i18n JSON), `react-best-practices`, `next-best-practices` (`"use client"` on the view), `security` (no `dangerouslySetInnerHTML`).
    - **Owner:** implementer.

**Wave 4 — wiring + run injection; editor tabs (after wave 3)**

12. [wave 4, after 7, 10] `server/src/platform/container.ts`, `server/src/modules/index.ts`, `server/src/modules/reviews/types.ts`, `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/service.ts`
    - **Container:** a lazy `projectContextService` getter (singleton, so the token cache is shared) that builds Deps from:
      - `new ProjectContextRepository(db)`;
      - the `checkout.ts` functions;
      - `(ref, b) => this.git.sync(ref, b).then(() => undefined)`;
      - `this.tokenizer`;
      - `(p, m) => p === 'openrouter' ? this.priceBook.contextLength(m) : null`;
      - `console`.
    - **Registry:** register `projectContext` in `modules/index.ts`.
    - **`reviews/types.ts`:** declare a local `ProjectContextResolver` port, structurally identical to the service's `resolveForRun`. Copy the shapes; no import from `modules/project-context` (`no-cross-module`).
    - **`ReviewRunExecutor`** gets an optional 5th constructor arg `projectContext?: ProjectContextResolver`, so existing 3- and 4-arg tests keep compiling. `ReviewService` passes `container.projectContextService`.
    - **In `runOneAgent`, after `resolveActiveSkills`** (and inside the existing try):
      1. Call `resolveForRun({ workspaceId, repoId: pull.repoId, agentId: agent.id, provider: agent.provider, model: agent.model, activeSkills })` once per run. Wrap it fail-open: on an unexpected throw, log and continue without docs.
      2. Pass `projectDocs` to `reviewPullRequest` only when non-empty (AC-32).
      3. `runLog.info` with paths and counts only.
      4. Emit one structured `event: 'project_context'` log with `{attached, added, skipped, dropped, totalTokens}` (NFR-6).
    - **Trace:** `specs_read` = the included paths (AC-41). `project_context` = the resolver's trace object, present whenever the agent had any attachment (AC-39, AC-40). `traceFromBuffer` stays unchanged.
    - **Hot path:** do not tokenize anything else (server `INSIGHTS.md` 2026-09-24). Read config, if needed, as `this.container.config?.…`.
    - **Implements:** AC-12, AC-16, AC-21, AC-27, AC-28, AC-31, AC-32, AC-33, AC-34, AC-35, AC-39, AC-40, AC-41, EC-1, EC-2, EC-4, EC-5, EC-11, EC-12, NFR-3, NFR-5, NFR-6.
    - **Governed by:** `onion-architecture` — the composition root is the only place concrete pieces meet; the reviews module reaches project-context only through a port in its own `types.ts`; do not add to the arch baseline, and the existing `run-executor` whole-`Container` debt is not extended. Also `fastify-best-practices` (registry entry), `typescript-expert`, `security`.
    - **Owner:** implementer.

13. [wave 4, after 8, 11] `client/src/app/agents/[id]/page.tsx` (`VALID_TABS` += `context`), `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `…/AgentEditor/constants.ts`, `…/AgentEditor/_components/ContextTab/` (new: `index.ts`, `ContextTab.tsx`, `SortableDocRow.tsx`, `helpers.ts`, `constants.ts`, `styles.ts`), `client/messages/en/agents.json`
    - **Tab setup:** a "Context" tab scoped to `useActiveRepo().repoId`, showing the repo name. If there is no repo, show an empty state.
    - **Sections:**
      - Attached: sortable with dnd-kit `PointerSensor` + `KeyboardSensor`, as in SkillsTab; drag disabled while filtering.
      - Available: a checkbox per discovered document; too-large rows are inert, with a "Too large" text label.
      - Inherited: read-only rows labelled "via <skill>" with no checkbox; duplicates are marked.
    - **Header:**
      - "N of M attached" (N = own attached, M = `discovered_count`).
      - A name filter.
      - "≈ T tokens": the exact `total_tokens` from the server. While a save is pending, it shows `helpers.estimateTotal(overhead, tokens)`.
    - Toggle or reorder triggers an immediate optimistic `useSetAgentContext`.
    - The per-row Preview opens a `Modal` with `DocPreview` and does not change attachments.
    - Accessible names on the checkbox and Preview button include the document name. The state is shown as text, not colour only.
    - **Implements:** AC-10, AC-11, AC-12, AC-13, AC-14, AC-20, AC-23 (display), AC-25, AC-26, NFR-2, NFR-7a, NFR-7b, NFR-7c.
    - **Governed by:** `frontend-architecture` (route `_components`, helpers pure, shared `DocPreview` import from `@/components/project-context/DocPreview`), `react-best-practices` (derive the estimate at render, no `useEffect` syncing; key = path), `next-best-practices`.
    - **Owner:** implementer.

14. [wave 4, after 8, 11] `client/src/app/skills/[id]/page.tsx` (`VALID_TABS` += `context`), `client/src/app/skills/[id]/_components/SkillEditor/SkillEditor.tsx`, `…/SkillEditor/constants.ts`, `…/SkillEditor/_components/SkillContextTab/` (new: `index.ts`, `SkillContextTab.tsx`, `helpers.ts`, `styles.ts`), `client/messages/en/skills.json`
    - **Tab content:**
      - A "Context" tab scoped to the active repo.
      - The note "Any agent using this skill inherits these documents".
      - Attached (ordered) and available checkboxes, with the same too-large rule.
      - A total of "≈ T tokens" (AC-24) and a per-row Preview with `DocPreview`.
    - **"Serializes as"** renders `serialized` verbatim in a `<pre>`. It is the server's `renderProjectContext` output, so it carries the `## Project context` heading (AC-19). It is not re-rendered client-side.
    - Immediate optimistic save via `useSetSkillContext`.
    - **Implements:** AC-14, AC-15, AC-19, AC-24, AC-25, AC-26, NFR-7b, NFR-7c.
    - **Governed by:** `frontend-architecture`, `react-best-practices`, `next-best-practices`.
    - **Owner:** implementer.

**Wave 5 — non-trivial tests (after wave 4) — all [DEFERRABLE — skipped by /run-plan]**

15. [wave 5, after 1, 5, 10] **[DEFERRABLE — skipped by /run-plan]** `reviewer-core/test/project-context.test.ts` (new), `server/test/project-context-helpers.test.ts` (new), `server/test/project-context-checkout.test.ts` (new; tmpdir fixtures, unit lane)
    - **reviewer-core:** two documents give two `<untrusted source="project-doc:…">` blocks with the paths (AC-29). `</untrusted>` inside a document gives exactly one closing tag per document (AC-30). A path label containing `"` stays inside the attribute.
    - **helpers:** D1, D2 + S1[D3] + S2[D4] gives D1..D4 (AC-18). A shared document appears once, at its first position (AC-17). Budget drops last, then the last two, and a first document over budget gives an empty block with every document recorded as `over_budget` (AC-34, EC-13). Whitespace-only documents are not counted (AC-36). Equal-length prose versus code/Cyrillic give different counts with the real tokenizer (AC-22).
    - **checkout:**
      - Discovery of `specs/`, `docs/a/b/`, `insights/`; the same file name in two folders is listed by full path (AC-1, EC-10).
      - Root `README.md`, `node_modules/x/readme.md` and `docs/a.txt` are excluded (AC-2).
      - An empty result (AC-7 server side).
      - `../../etc/passwd` and an outward symlink are refused, content never returned (AC-35, NFR-4a).
      - One byte over the limit gives `too_large` without reading (AC-9, NFR-4d).
      - Binary or non-UTF-8 gives `unreadable` (AC-33, EC-7).
    - Cases are sourced from the spec ACs above, not from the implementation.
    - **Implements:** test coverage for the IDs listed.
    - **Governed by:** `onion-architecture` `rules/testing.md` (fakes for ports, unit vs `.it`), `typescript-expert`.
    - **Owner:** test-writer.

16. [wave 5, after 10, 12] **[DEFERRABLE — skipped by /run-plan]** `server/test/project-context.it.test.ts` (new), `server/test/project-context-run.it.test.ts` (new) — both must end in `.it.test.ts`.
    - **Routes:**
      - List with labels and counts (AC-1, AC-2).
      - Usage counter = 3 with agent A counted once (AC-6).
      - No checkout gives 409 with code and reason (AC-8).
      - Too-large attach gives 422 (AC-9).
      - Attach, re-fetch, detach; the file is unchanged (AC-10, AC-11, AC-15).
      - Repo X versus Y (AC-21).
      - The total equals `tokenizer.count(renderProjectContext(...))` of the run's block (AC-23).
      - Refresh picks up changed content and token count (AC-5).
      - An agent, skill or repo id from another workspace gives 404 (NFR-4e).
      - 500 × 20 KB with p95 ≤ 1000 ms over 20 requests (NFR-1; may be marked `.skip` on CI if flaky, report it).
    - **Run (MockLLMProvider):**
      - Order B, A respected (AC-12).
      - Only the enabled skill's documents are included (AC-16).
      - Both full texts appear under the heading (AC-27).
      - A map-reduce run with a file mutated mid-run keeps the same text in all chunks (AC-28).
      - Run single, run `all:true`, and re-run all include the document (AC-31).
      - Missing, unreadable and too-large skips appear in the trace (AC-33).
      - Budget drop is recorded (AC-34; inject a small budget via the `contextWindow` fake or override).
      - Containment refusal (AC-35).
      - Trace text survives file modification or deletion (AC-39).
      - LLM call count is equal with and without documents (NFR-3).
      - A unique marker never appears in logs (NFR-5).
      - The four counters are logged (NFR-6).
    - Use `vi.waitFor` for trace reads after `done`.
    - **Governed by:** `onion-architecture` `rules/testing.md`, `fastify-best-practices` (`inject`), `drizzle-orm-patterns`, `security`.
    - **Owner:** test-writer.

17. [wave 5, after 9, 11, 13, 14] **[DEFERRABLE — skipped by /run-plan]** Colocated tests:
    - `client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.test.tsx`
    - `client/src/components/project-context/DocPreview/DocPreview.test.tsx`
    - `…/AgentEditor/_components/ContextTab/ContextTab.test.tsx`
    - `…/SkillEditor/_components/SkillContextTab/SkillContextTab.test.tsx`
    - `…/RunTraceDrawer/_components/ProjectContextBlock/ProjectContextBlock.test.tsx`

    **Cases:**
    - Markdown headings, list, code and table render (AC-3).
    - `<script>` and `<img onerror>` stay inert, and `javascript:` links are stripped (AC-4, NFR-4c).
    - Empty state names the 3 folders (AC-7).
    - Error with retry (AC-8 UI).
    - "2 of 7 attached" and the filter (AC-13).
    - Preview leaves attachments unchanged (AC-14).
    - Inherited "via <skill>" row with no checkbox, and the total includes it (AC-20).
    - A toggle changes the total in the same render (AC-25); time on 50 documents is ≤ 200 ms (NFR-2).
    - Token values are shown (AC-26).
    - Skill "Serializes as" equals `serialized` and starts with `## Project context` (AC-19).
    - Skill total (AC-24).
    - Trace row with "untrusted", "2 docs" and tokens (AC-37).
    - Expand gives injection order and full text (AC-38).
    - Skipped/dropped list (AC-40).
    - Specs read paths (AC-41).
    - Copy writes the block (AC-42).
    - An old trace without `project_context` renders (AC-43).
    - Keyboard reorder, accessible names, text state labels (NFR-7).

    Use `fireEvent`, not user-event. Include the `skills`/`agents`/`runs`/`context` namespaces in test messages.
    - **Governed by:** `react-testing-library`, `frontend-architecture` (colocated placement).
    - **Owner:** test-writer.

### File ownership (per wave)
| Wave | Step | Files owned |
|---|---|---|
| 1 | 1 | `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts`, `reviewer-core/src/index.ts`, `reviewer-core/test/prompt.test.ts` |
| 1 | 2 | `server/src/vendor/shared/contracts/project-context.ts`, `server/src/vendor/shared/contracts/trace.ts`, `server/src/vendor/shared/index.ts`, `client/src/vendor/shared/contracts/project-context.ts`, `client/src/vendor/shared/contracts/trace.ts`, `client/src/vendor/shared/index.ts` |
| 1 | 3 | `server/src/db/schema/project-context.ts`, `server/src/db/schema.ts`, `server/src/db/migrations/**` (generated only) |
| 1 | 4 | `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/nav.test.ts` |
| 2 | 5 | `server/src/modules/project-context/{constants,types,helpers,checkout}.ts` |
| 2 | 6 | `server/src/modules/project-context/repository.ts` |
| 2 | 7 | `server/src/platform/price-book.ts` (+ `server/test/price-book.test.ts` if the trivial case is added) |
| 2 | 8 | `client/src/lib/hooks/project-context.ts`, `client/src/lib/hooks/index.ts`, `client/src/lib/hooks/core.ts` |
| 2 | 9 | `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/ProjectContextBlock/**`, `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `client/messages/en/runs.json` |
| 3 | 10 | `server/src/modules/project-context/{service,routes,index}.ts` |
| 3 | 11 | `client/src/app/repos/[repoId]/context/**`, `client/src/components/project-context/**`, `client/messages/en/context.json` |
| 4 | 12 | `server/src/platform/container.ts`, `server/src/modules/index.ts`, `server/src/modules/reviews/types.ts`, `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/service.ts` |
| 4 | 13 | `client/src/app/agents/[id]/page.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/{AgentEditor.tsx,constants.ts}`, `…/AgentEditor/_components/ContextTab/**`, `client/messages/en/agents.json` |
| 4 | 14 | `client/src/app/skills/[id]/page.tsx`, `client/src/app/skills/[id]/_components/SkillEditor/{SkillEditor.tsx,constants.ts}`, `…/SkillEditor/_components/SkillContextTab/**`, `client/messages/en/skills.json` |
| 5 | 15 | `reviewer-core/test/project-context.test.ts`, `server/test/project-context-helpers.test.ts`, `server/test/project-context-checkout.test.ts` |
| 5 | 16 | `server/test/project-context.it.test.ts`, `server/test/project-context-run.it.test.ts` |
| 5 | 17 | the five colocated client `*.test.tsx` files listed in step 17 |

No file appears twice within a wave. `client/messages/en/*.json` files are split per owning step. The cross-package contract change sits entirely in step 2.

### Spec coverage
| ID | Priority | Step(s) | Test owner |
|---|---|---|---|
| AC-1 | MUST | 2, 4, 5, 10, 11 | test-writer 15, 16 |
| AC-2 | MUST | 5, 10 | test-writer 15, 16 |
| AC-3 | MUST | 11 | test-writer 17 |
| AC-4 | MUST | 11 | test-writer 17 |
| AC-5 | SHOULD | 8, 10, 11 | test-writer 16 |
| AC-6 | MUST | 6, 10, 11 | test-writer 16 |
| AC-7 | MUST | 11 | test-writer 15 (server), 17 (UI) |
| AC-8 | MUST | 10, 11 | test-writer 16, 17 |
| AC-9 | MUST | 2, 5, 10, 11, 13, 14 | test-writer 15, 16 |
| AC-10 | MUST | 3, 6, 8, 10, 13 | test-writer 16 |
| AC-11 | MUST | 3, 6, 8, 10, 13 | test-writer 16 |
| AC-12 | MUST | 3, 6, 10, 12, 13 | test-writer 16 |
| AC-13 | MUST | 13 | test-writer 17 |
| AC-14 | SHOULD | 11, 13, 14 | test-writer 17 |
| AC-15 | MUST | 3, 6, 8, 10, 14 | test-writer 16 |
| AC-16 | MUST | 6, 10, 12 | test-writer 16 |
| AC-17 | MUST | 5, 10 | test-writer 15 |
| AC-18 | MUST | 5, 10 | test-writer 15 |
| AC-19 | MUST | 1, 10, 14 | test-writer 17 |
| AC-20 | SHOULD | 10, 13 | test-writer 17 |
| AC-21 | MUST | 3, 6, 10, 12 | test-writer 16 |
| AC-22 | MUST | 5, 10 | test-writer 15 |
| AC-23 | MUST | 10, 13 | test-writer 16 |
| AC-24 | MUST | 10, 14 | test-writer 17 |
| AC-25 | MUST | 8, 13, 14 | test-writer 17 |
| AC-26 | SHOULD | 10, 11, 13, 14 | test-writer 17 |
| AC-27 | MUST | 1, 12 | test-writer 16 |
| AC-28 | MUST | 1, 10, 12 | test-writer 16 |
| AC-29 | MUST | 1 | test-writer 15 |
| AC-30 | MUST | 1 | test-writer 15 |
| AC-31 | MUST | 12 | test-writer 16 |
| AC-32 | MUST | 1, 12 | implementer inline (step 1) |
| AC-33 | MUST | 5, 10, 12 | test-writer 15, 16 |
| AC-34 | MUST | 5, 10, 12 | test-writer 15, 16 |
| AC-35 | MUST | 5, 10, 12 | test-writer 15, 16 |
| AC-36 | COULD | 5, 10 | test-writer 15 |
| AC-37 | MUST | 9 | test-writer 17 |
| AC-38 | MUST | 9 | test-writer 17 |
| AC-39 | MUST | 2, 10, 12 | test-writer 16 |
| AC-40 | MUST | 9, 12 | test-writer 17 |
| AC-41 | SHOULD | 9, 12 | test-writer 17 |
| AC-42 | COULD | 9 | test-writer 17 |
| AC-43 | MUST | 2, 9 | test-writer 17 |
| EC-1 | — | 5, 12 | test-writer 16 |
| EC-2 | — | 10, 12 | test-writer 16 |
| EC-3 | — | 5 | test-writer 15 |
| EC-4 | — | 6, 12 | test-writer 16 |
| EC-5 | — | 1, 12 (repeat per chunk, OQ-4) | test-writer 16 |
| EC-6 | — | 5 | test-writer 15 |
| EC-7 | — | 5 | test-writer 15 |
| EC-8 | — | 5 | test-writer 15 |
| EC-9 | — | 5, 10 | test-writer 16 (NFR-1) |
| EC-10 | — | 5 | test-writer 15 |
| EC-11 | — | 10, 12 | test-writer 16 |
| EC-12 | — | 6, 12 | test-writer 16 |
| EC-13 | — | 5 | test-writer 15 |
| EC-14 | — | not planned (OQ-7: attachments not versioned) | manual |
| NFR-1 | SHOULD | 5, 10 | test-writer 16 |
| NFR-2 | SHOULD | 13 | test-writer 17 |
| NFR-3 | MUST | 7, 10, 12 | test-writer 16 |
| NFR-4 | MUST | (a) 5, 10; (b) 1; (c) 11; (d) 5; (e) 2, 6, 10 | test-writer 15, 16, 17 |
| NFR-5 | MUST | 10, 12 | test-writer 16 |
| NFR-6 | SHOULD | 12 | test-writer 16 |
| NFR-7 | SHOULD | 9, 11, 13, 14 | test-writer 17 |

Every MUST row has an implementing step. In this `/run-plan` pass, every MUST except AC-32 has its test **deferred** with steps 15-17. Until those run, MUST coverage is verified only by typecheck and manual checks.

### Skills the implementer will invoke
From `pr-self-review` Phase 4 (loaded at plan time — not copied here):
- **reviewer-core** (`reviewer-core/src/**`, step 1): `onion-architecture`, plus `typescript-expert` and `security`.
- **server modules, platform and db** (steps 3, 5, 6, 7, 10, 12): `onion-architecture`.
  - Also `fastify-best-practices` for `project-context/routes.ts` and `modules/index.ts` (steps 10, 12).
  - Also `drizzle-orm-patterns` for `db/**` and `project-context/repository.ts` (steps 3, 6).
  - Also `postgresql-table-design` for `db/schema/**` and `db/migrations/**` (step 3; migrations also trip the pr-self-review phase-3 gate).
- **zod**: any file importing `zod` or under `**/vendor/shared/**` (steps 2, 10).
- **client** (`client/src/**`, non-vendor; steps 8, 9, 11, 13, 14): `frontend-architecture`, `react-best-practices`, `next-best-practices`.
- **client vendored UI** (`client/src/vendor/ui/**`, step 4): `frontend-architecture` (vendored; barrel rule).
- **client tests** (`client/**/*.test.tsx`, step 17 and the trivial nav test in step 4): `react-testing-library` + `frontend-architecture`.
- **every `*.ts`/`*.tsx` file**: `typescript-expert`, `security`.
- **`client/messages/**`** (steps 9, 11, 13, 14): no skill exists. Keep key parity; there is only one locale (`en`).

### Verification scope
- **After each wave:** `bash scripts/verify-changed.sh`. It covers the touched packages only:
  - typecheck, plus `vitest related` (server unit lane only);
  - `pnpm arch:check`, triggered by server layers and reviewer-core;
  - `check-vendor-shared-sync.sh`, triggered by wave 1 step 2.
- **After wave 1, step 3:** `cd server && pnpm db:generate`. Review that the generated SQL only creates the two tables and their indexes, with no DROPs. The user runs `pnpm db:migrate` locally.
- **Once at the end:** `bash scripts/verify-changed.sh --full` for `reviewer-core` (prompt/run suite), `server` (unit lane, including `run-executor-skills.test.ts`, `prompt-*.test.ts`, `price-book.test.ts`, `routes-smoke.test.ts`) and `client` (agent/skill editors, trace drawer, nav).
- **Windows note:** the 6 known `indexer-pipeline.test.ts` failures on Windows are pre-existing (server `INSIGHTS.md` 2026-09-20).
- **When the deferred test-writer steps run:** `cd server && pnpm exec vitest run test/project-context.it.test.ts test/project-context-run.it.test.ts` (Docker required). Check the `skipped` count; a skipped integration suite is not a pass.
- **No full suite** is run by default; mcp-server and e2e are untouched.

### Explicitly out of scope
For the `architecture-reviewer` and `security-reviewer` agents:
- Whether the synchronous refresh (`GitClient.sync` from a request) should instead go through the job queue to avoid racing repo-intel jobs (recommendation 4).
- Whether the run executor's existing whole-`Container` dependency should be refactored. The plan only adds an optional port and does not touch the baseline.
- Whether `checkout.ts` (fs I/O inside a module, following the `brief/clone.ts` precedent) should become a proper adapter, which would need `checkout-paths.ts` moved out of `modules/_shared`.
- Security review of:
  - label escaping in `renderProjectDocBlock`;
  - symlink/TOCTOU handling between discovery and read;
  - the rate limit chosen for refresh;
  - whether returning `serialized` and document content over the API needs extra authorization beyond workspace scoping. This is a local-first app using `LocalNoAuthProvider`.
- Whether `PriceBook` is the right home for a context-window lookup.

### Open questions / assumptions
**Assumptions adopted** because `AskUserQuestion` was unavailable. Each can be vetoed before `Status: approved`.
- **OQ-1 (token budget).** `budget = clamp(floor(contextLength × 0.2), 4 000, 32 000)` when the agent's model context window is known from the cached OpenRouter `/models` list (`PriceBook`). Otherwise a constant **16 000** tokens applies (OpenAI/Anthropic, cold cache). It costs no extra call (NFR-3). The constants live in `project-context/constants.ts`; the user can veto them or change the numbers.
- **OQ-2 (size limit).** **256 KB** per document (`MAX_DOC_BYTES`, matching `brief`'s `MAX_SPEC_BYTES`).
- **OQ-3 (ordering).** The agent's own documents first, then by skill order, then by in-skill order; first occurrence wins.
- **OQ-4 (chunked mode).** The block **repeats in every chunk**, which is existing engine behaviour. The UI total reflects one prompt. **Follow-up:** evaluate first-chunk-only or a cached prefix, and show a multiplied-cost hint for map-reduce agents.
- **OQ-5 (branch).** Documents are read from the synced **default-branch checkout**. A spec added in the PR itself does not affect that PR.
- **OQ-6 (editing).** View-only, as the spec decides.
- **OQ-7 (scope and save).** Attachments are pinned to **(repo, path)** and only apply to runs for that repo. The agent and skill tabs act on the **active repo** (`useActiveRepo`). The API replaces the full ordered list, so it works with either save style. The **UI saves immediately** (optimistic) on toggle or reorder; recommendation 7 explains why. Attachments are **not** versioned or restored with agent or skill versions (EC-14).
- **OQ-10.** No rename tracking. A renamed file becomes `missing` (EC-1).
- **OQ-11.** `cl100k_base` everywhere, hence "≈".
- **OQ-12.** The NFR-1 and NFR-2 targets are taken as stated.
- **AC-6 counting.** Only enabled, non-flagged skills count; all agents count (recommendation 2).
- **Blank documents (AC-36).** Skipped with no trace reason; counted in the NFR-6 `skipped` log counter (recommendation 5).
- **`.md` matching.** Case-insensitive (`README.MD` counts). `node_modules/` and `.git/` are skipped inside the roots too. Directory symlinks are never followed.
- **Legacy contracts.** `SpecFile`/`IndexStatus` stay in the vendored contracts (unused, re-exported by `client/src/lib/types.ts`). Removing them is a separate cleanup.
- **Nav placement.** The nav item goes in WORKSPACE, not SKILLS LAB, because `nav.test.ts` pins SKILLS LAB membership and Project Context is repo-scoped like Pull Requests. No `g` shortcut.

**Unresolved (no plan impact):** OQ-8 (Coverage), OQ-9 (Indexed footer), OQ-13 (CI-runner parity). The new optional `ReviewInput.projectDocs` is the hook a CI runner would use. OQ-14 UX ideas.

**Tests deferred:** every non-trivial test (steps 15-17) is deferred by `/run-plan`. `plan-verifier` should report those steps as not executed rather than failed.
