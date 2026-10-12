# Development Plan: PR Brief contract gaps
Spec: specs/2026-10-11-pr-brief-contract-gaps.md
Status: approved

## Development Plan: PR Brief contract gaps

### Requirements review
**Source reviewed:** `specs/2026-10-11-pr-brief-contract-gaps.md` (SPEC-04, `Status: approved`, so it can be planned). OQ-1 to OQ-8 are resolved in the spec. OQ-9 (unadopted UX ideas) is ignored, as the caller instructed. SPEC-03 and its plan (`docs/plans/2026-10-11-pr-brief-polish-plan.md`) are already implemented. This plan does not redo them: navigation, skeleton, not-in-diff notice and the verdict banner are untouched.

**Spec claims checked against the code (2026-10-11), all hold:**
- `constants.ts:21` `BRIEF_INPUT_TOKEN_BUDGET = 8000`.
- `prompts.ts:108-109` counts `system + user` and stops after the last drop step. Nothing logs when the input is still over budget, so AC-19 is new work.
- `schemas.ts:39-45` and contract `brief.ts:109-115` have no `summary`.
- `routes.ts:35-37` registers only `/brief/generate`. The only caller is `client/src/lib/hooks/brief.ts:40`. A grep of `mcp-server/src`, `e2e` and every `*.md` finds no other reference.
- `grounding.ts:69-73` drops a risk with no surviving ref (AC-9). `grounding.ts:138-146` keeps a focus item on a changed file with `line: null`, and only an unknown file goes to `dropped.focus` (AC-10, AC-11). AC-10 is therefore already met in code too, even though the spec doesn't say so. It needs a test, not a change.
- `service.ts:138` resolves the model via `risk_brief` (AC-14). `service.ts:144` is the one `completeStructured` call. `service.ts:152-205` writes the `brief.generate` log on both failure and success (AC-15 fields are present).
- `facts.ts:162-169` carries `available` flags for intent, issue and spec. Blast availability can only be read from `blast.degraded` / `blast.indexStatus`. `RepoIntelService.getIndexState` returns `status: 'degraded', reason: 'no_data'` when no index exists (`repo-intel/service.ts:211-227`).

**Facts the spec marked "not seen", now checked:**
- `pr_brief.json` is `jsonb NOT NULL` (`db/schema/reviews.ts:101`). `BriefRepository.getBrief` casts `row.json as PrBrief`, and no route declares a response schema. So new optional JSON fields need **no migration**, and legacy rows are served as-is (NFR-2).
- The container passes the global `console` as `BriefLogger` (`platform/container.ts:163-166`), so a `warn` method is already available at runtime.
- `Tokenizer` is `{ count(text): number }` (`adapters/tokenizer/index.ts:16-17`).
- Server and client use zod `^3.24.1`.
- **No brief tests exist in `server/test/` today.** Every server-side brief test in this plan is new.
- Line endings: every file in `server/src/modules/brief/*.ts`, both vendored `contracts/brief.ts` files, `client/src/lib/hooks/brief.ts`, `PrBriefCard/styles.ts` and `PrBriefCard.test.tsx` are **CRLF**. `PrBriefCard.tsx` and `client/messages/en/brief.json` are **LF**. The two vendored `brief.ts` copies are byte-identical today (checked with `diff`).

**Clarifications:** I ran as a subagent without `AskUserQuestion`. The caller said no further clarification is needed. Every remaining doubt is listed as a vetoable assumption under "Open questions / assumptions" (A1-A12).

**Recommended improvements to the requirements (for the spec owner; I did not edit the spec):**
- R1 [non-blocking] AC-12 says "unavailable" but does not define it per input. In particular it doesn't say whether a spec or issue body dropped by the budget loop counts as missing, or what "Blast radius unavailable" means in index terms. *Adopted:* A3/A4.
- R2 [non-blocking] AC-4/AC-5 don't say whether `what`/`why` stay visible when a `summary` exists. *Adopted literal reading:* summary replaces the what/why pair in the card body (A1).
- R3 [non-blocking] AC-1 requires a non-empty summary, but grounding can in theory empty it (for example, a summary that is only a neutralised link with an empty label). *Adopted:* a deterministic fallback (A2).
- R4 [non-blocking] NFR-3 says "every generation attempt including failures". A missing provider key (`ConfigError` from `this.llm(provider)`) happens before the model call and today propagates as an HTTP error with no `brief.generate` line. *Adopted:* unchanged behaviour (A8). The SHOULD is met for model-call failures.
- R5 [non-blocking] AC-7's "optional body" means a POST with no body at all must be accepted. Today's `GenerateBriefBody` rejects `undefined`. *Adopted:* both paths accept an absent body (A6).
- R6 [non-blocking] Legacy briefs have no `missing_inputs`, and the card cannot know what was missing for them. *Adopted:* no statement for legacy rows (A5).
- R7 [non-blocking] The spec problem list notes that an absent issue/spec is omitted from the *prompt*, but no AC requires the prompt to mark it. *Declined for this plan* (no AC; it would add tokens). It is listed under out of scope.

**Execution mode:** single-agent, as the caller decided. No subagents were used.

### Scope
This plan:
- adds an additive, optional `summary` and an optional server-computed `missing_inputs` list to the shared `PrBrief` contract (both vendored copies, kept byte-identical);
- has the model produce `summary`, grounded like `what`/`why` and clamped to 3 sentences;
- stores and returns `missing_inputs` (intent, blast radius, linked issue, specs), computed from the fact set;
- logs a warning when the assembled input is still over the 8,000-token budget after every drop step;
- adds the canonical `POST /pulls/:id/brief`, keeping `/brief/generate` as a permanent alias on the same handler and singleton service (shared in-flight guard), and moves the client hook to the canonical path;
- renders the summary (or legacy what/why) and the missing-inputs statement in the PR Brief card;
- adds tests for every AC, including characterization tests for the criteria the spec marks as already met (AC-9, AC-11, AC-14, AC-16, AC-17, AC-18) and AC-10.

Not covered:
- SHA caching/staleness, the drop order, risk/focus bounds, run-trace surfacing, any `mcp-server` brief tool (spec non-goals);
- removing `what`/`why`;
- prompt-side marking of absent issue/spec (R7);
- OQ-9 UX ideas;
- DB schema/migrations (none needed);
- e2e flows.

### Modules affected
- **server**
  - `server/src/modules/brief/` (`constants.ts`, `schemas.ts`, `grounding.ts`, `prompts.ts`, `facts.ts`, `service.ts`, `routes.ts`);
  - `server/src/vendor/shared/contracts/brief.ts`;
  - new tests in `server/test/`.
  - No change to `platform/container.ts` (`console` already has `warn`), `db/**`, adapters, or other modules.
- **client**
  - `client/src/vendor/shared/contracts/brief.ts` (mirror);
  - `client/src/lib/hooks/brief.ts` (canonical path);
  - `PrBriefCard/` (body rendering via a new `_components/BriefBody/`);
  - `client/messages/en/brief.json`;
  - tests.
- **reviewer-core / e2e / mcp-server:** not touched.

### Architectural constraints
- **Root `AGENTS.md`** and `server/AGENTS.md` / `client/AGENTS.md` "Do not touch":
  - `vendor/shared/**` changes must be mirrored by hand;
  - server is canonical (`pr-self-review` Phase 3 #1);
  - `scripts/check-vendor-shared-sync.sh` must pass.
- **`server/AGENTS.md` + `onion-architecture`:**
  - `routes.ts` only validates, makes **one** service call and returns. The two POST paths share one handler function and call `service.generate`; no logic lives in the route;
  - only `repository.ts` touches Drizzle (unchanged here);
  - the service keeps its narrow ports, with no `Container` import;
  - `missing_inputs` derivation and the over-budget decision are pure functions in the module's pure files (`facts.ts` / `prompts.ts`), never in `routes.ts`;
  - run `pnpm arch:check`; the baseline may only shrink;
  - relative imports keep the `.js` suffix (Phase 3 #5).
- **`onion-architecture` "shared kernel" compromise:** `BriefInput` (the enum of input names) may be imported inward from `@devdigest/shared` by `facts.ts`/`service.ts`.
- **`server/INSIGHTS.md`:**
  - 2026-09-24 and 2026-10-10: `Write`/`Edit` can flip CRLF to LF and write cp1252 `0x97`. After each edit, check `git diff --stat`, `file <path>` and `LC_ALL=C grep -c $'\x97' <path>`. For the vendored mirror, edit the server copy, then copy the whole file across and re-check CRLF (2026-09-18 "copy whole-file");
  - 2026-10-10 "Exactly-one-LLM-call": adapters may retry internally. Per spec OQ-5 the brief keeps the adapter defaults and counts *service* calls, so do **not** add `maxRetries: 0` / `transportRetries: 0`;
  - mock-provider seams: register `MockLLMProvider` under the provider the `risk_brief` default resolves to, or set the workspace setting explicitly; `MockLLMProvider` records the call before delaying/throwing;
  - 2026-10-10 "Asserting structured logs": spy on `console.info` / `console.warn` and read `mock.calls[n][0]`, or inject a capturing `BriefLogger` in service unit tests;
  - 2026-09-20 "green `.it` can be 100% skipped": check the skipped count;
  - 2026-10-10 "Spread-then-override drops a counter": don't spread objects into the log line.
- **`client/AGENTS.md` + `frontend-architecture`:**
  - sub-component in `PrBriefCard/_components/BriefBody/` with an `index.ts` forwarder;
  - strings only from `messages/en/brief.json`;
  - styles in `styles.ts` using `var(--…)` tokens;
  - the component never fetches;
  - contract types come from `@devdigest/shared`, never redeclared;
  - `src/lib/hooks/brief.ts` is the only API surface.
- **`client/INSIGHTS.md`:**
  - 2026-09-30: `fireEvent`, not `user-event`;
  - 2026-10-10: mock `@/lib/hooks/brief` via the alias; `ApiError` must stay real via `vi.importActual` if `../api` is mocked;
  - 2026-10-11: `vitest run` with a `[bracket]` path matches no files, so filter by test name; catalogue-sentinel tests prove no hard-coded labels; `useToast` throws outside `ToastProvider`;
  - 2026-09-19: `messages/en/*.json` are auto-loaded namespaces, so only additive keys;
  - 2026-09-20: `ToastProvider` owns a `role="status"`, so the missing-inputs note gets no `role="status"`;
  - 2026-10-05 / 2026-09-20: preserve CRLF/LF per file and keep real UTF-8.

### Steps

1. [wave 1] Contract + sync test.
   - **Files:**
     - `server/src/vendor/shared/contracts/brief.ts`, then a whole-file copy to `client/src/vendor/shared/contracts/brief.ts`;
     - new `server/test/brief-contract.test.ts`.
   - **Contract change** (additive only, both files byte-identical and CRLF):
     - new `export const BriefInput = z.enum(['intent', 'blast_radius', 'linked_issue', 'specs'])` + `export type BriefInput`, placed above `PrBrief`;
     - `PrBrief` gains:
       - `summary: z.string().optional()`, with a doc comment: what + why, ≤3 sentences, absent on briefs stored before SPEC-04 (AC-3);
       - `missing_inputs: z.array(BriefInput).optional()`, with a doc comment: server-computed from the fact set, never model-authored; absent on legacy rows; `[]` when all four inputs were available.
     - Field order: `what, why, summary, risk_level, risks, review_focus, missing_inputs`.
     - Update the `BriefGenerateResult` doc comment (line 184) to name `POST /pulls/:id/brief` (canonical) and `/brief/generate` (alias).
     - `vendor/shared/index.ts` already does `export * from './contracts/brief.js'`, so no index change is needed.
   - **`brief-contract.test.ts`** (trivial, implementer inline):
     - AC-6: read both files as **bytes** via `node:fs` + `fileURLToPath(new URL('../../client/src/vendor/shared/contracts/brief.ts', import.meta.url))` and the server path. Assert equal `Buffer`s, and assert that `PrBrief.shape` has `summary` and `missing_inputs`;
     - also: `PrBrief.parse` of a legacy `{what, why, risk_level, risks, review_focus}` object succeeds with `summary`/`missing_inputs` undefined (AC-3 / NFR-2 contract half).
   - Run `bash scripts/check-vendor-shared-sync.sh`.
   - implements: AC-1 (contract), AC-3, AC-6, AC-12 (contract), NFR-2 — governed by: onion-architecture (shared-kernel contract, mirror both copies), zod (optional additive fields; enums via `z.enum`), typescript-expert — owner: implementer

2. [wave 1, test-first characterization] Server unit tests for the criteria already met in code, written from the ACs. They must pass against the **current** code and keep passing after wave 2.
   - **Files (new):** `server/test/brief-grounding.test.ts`, `server/test/brief-prompt.test.ts`.
   - **Fixtures:**
     - build `BriefFactSet` objects by hand (all fields of `facts.ts:78-103`, including the five `Set`s);
     - build raw model output through a local factory `rawOutput(overrides) => ({ what, why, summary: 'S.', risk_level, risks, review_focus, ...overrides }) as BriefGenerationOutput`. The `as` keeps the fixture valid both before and after step 3 adds `summary`;
     - use a deterministic fake `Tokenizer` (`count: (t) => Math.ceil(t.length / 4)`).
   - **Cases in `brief-grounding.test.ts`:**
     - AC-9 / EC-5: a risk whose refs are all unknown paths is absent and its title is in `dropped.risks`; all risks dropped → `brief.risks` is `[]`;
     - a risk with one known blast-only ref survives;
     - AC-10 / EC-4: three focus items on changed files (valid in-hunk line / `line: null` / line outside every hunk) → all three survive, the first with its line, the others `line: null`; `dropped.focus` is empty and `dropped.lines` holds the out-of-hunk one;
     - AC-11: focus items citing a blast-only file and an unknown file are absent and both are listed in `dropped.focus`.
   - **Cases in `brief-prompt.test.ts`:**
     - AC-17: a fact set whose `files[].hunks` come from a patch containing a unique marker (e.g. `HUNK-BODY-MARKER-7f3a`). Build hunks with `hunkRangesFor(patch)` from `hunks.ts`, never by pasting the patch. Assert the marker is absent from every message, while paths and `start-end` ranges are present;
     - AC-18: an oversized fact set (many callers, endpoints, crons, files, spec and issue body) → `payload.droppedCount` equals the number of categories applied, in the fixed order. Assert via the rendered text: callers trimmed to 20 first, then crons gone, and so on. Final `tokens ≤ 8000`;
     - NFR-1: `BRIEF_INPUT_TOKEN_BUDGET === 8000`, and for the oversized fixture `tokenizer.count(messages.map(m => m.content).join(''))`-equivalent `≤ 8000` (system + user);
     - NFR-4a: PR title/body, issue body and spec content appear only inside `wrapUntrusted` blocks, and the system message ends with `INJECTION_GUARD`.
   - Run with `cd server && pnpm exec vitest run test/brief-grounding.test.ts test/brief-prompt.test.ts`.
   - implements: AC-9, AC-10, AC-11, AC-17, AC-18, NFR-1, NFR-4a, EC-4, EC-5 — governed by: onion-architecture `rules/testing.md` (pure units, no DB, no `*.it` suffix), typescript-expert — owner: test-writer

3. [wave 1] `client/messages/en/brief.json`. The file is **LF** + UTF-8; keep both.
   - **Additive keys only:**
     - `"missingInputs": { "statement": "Generated without: {inputs}.", "input": { "intent": "Intent", "blast_radius": "Blast radius", "linked_issue": "Linked issue", "specs": "Specs" } }`
   - No key for the summary itself (it is model text, not a label).
   - Change no existing key.
   - implements: AC-12 (strings), AC-13 — governed by: frontend-architecture (strings in `messages/en`), i18n key parity (only `en` exists) — owner: implementer

4. [wave 2, after 1] Server brief module, application + pure rings.
   - **Files:** `server/src/modules/brief/constants.ts`, `schemas.ts`, `grounding.ts`, `prompts.ts`, `facts.ts`, `service.ts`. All are CRLF; preserve them.
   - **`constants.ts`:** add `export const MAX_SUMMARY_SENTENCES = 3;` with a one-line rationale (SPEC-04 AC-1 / OQ-8). Leave `BRIEF_INPUT_TOKEN_BUDGET` at 8000 (NFR-1, never raise) and `MAX_SENTENCES` at 2.
   - **`schemas.ts`:** `BriefGenerationOutput` gains a required `summary: z.string().min(1).max(2000)`, placed after `why`. Empty or over-long output fails the schema and goes through the adapter's existing repair path (EC-2).
   - **`prompts.ts`:**
     - `BRIEF_SYSTEM_PROMPT` gets one `summary` entry in "Produce:": "at most 3 sentences: what this PR does and why, in plain language, grounded in the facts; if no intent/issue/spec signal is available, say so rather than inventing a motivation";
     - `RenderedBriefPayload` gains `budget: number` and `overBudget: boolean` (`tokens > BRIEF_INPUT_TOKEN_BUDGET`), set in the single return of `buildBriefMessages`;
     - do not change `DROP_STEPS`, their order, or the `stepIdx` stop rule.
   - **`grounding.ts`:**
     - in `groundBrief`: `const summaryGrounded = clampSentences(groundFreeText(raw.summary, facts, dropped), MAX_SUMMARY_SENTENCES)` (AC-2: same link neutralisation + citation scan as what/why);
     - if it trims to empty, fall back to `clampSentences(\`${what} ${why}\`, MAX_SUMMARY_SENTENCES)` (A2);
     - the returned `PrBrief` includes `summary`;
     - `groundBrief` does **not** set `missing_inputs` (not a grounding concern).
   - **`facts.ts`:** new exported pure `deriveMissingInputs(facts: BriefFactSet): BriefInput[]`. Order is fixed: `intent`, `blast_radius`, `linked_issue`, `specs`. Rules:
     - `intent` when `!facts.intent.available`;
     - `blast_radius` when `facts.blast.degraded || facts.blast.indexStatus === 'degraded' || facts.blast.indexStatus === 'failed'` (A4);
     - `linked_issue` when `!facts.issue.available`;
     - `specs` when `!facts.spec.available`.
     - Budget drops (`includeSpec`/`includeIssueBody` false) do not count (A3).
     - **Do not add fields to `BriefFactSet`** (step 2's hand-built fixtures depend on its shape).
   - **`service.ts`:**
     - `BriefLogger` gains `warn: (obj: unknown, msg?: string) => void` (`console` already satisfies it; no container change);
     - in `runGeneration`, after `buildBriefMessages`: if `payload.overBudget`, call `this.logger.warn({ prId: pull.id, provider, model, tokens: payload.tokens, budget: payload.budget }, 'brief.input_over_budget')` and still send the request (AC-19 / OQ-4). No prose in the warning;
     - after grounding: `const stored = { ...brief, missing_inputs: deriveMissingInputs(facts) }`; persist and return that object (AC-12/AC-13);
     - the success `brief.generate` log line keeps its current fields (AC-15). Add `missingInputs: string[]` (enum names only, no prose) only if it fits without spreading. Optional, see A10;
     - update the `generate` doc comment to name both POST paths;
     - keep exactly one `completeStructured` call, and keep the cache, refusal and in-flight early returns before any model resolution (AC-16 unchanged).
   - implements: AC-1, AC-2, AC-12, AC-13, AC-14 (unchanged), AC-15, AC-16 (unchanged), AC-18 (unchanged), AC-19, NFR-1, NFR-3, EC-2, EC-6, EC-8, EC-9 — governed by: onion-architecture (pure derivation in ring-1 files; the service owns orchestration and logs through its injected `BriefLogger` port, never `Container`; no Drizzle outside `repository.ts`), zod (model-facing schema separate from the stored contract, per `schemas.ts` header), security (summary is untrusted model output, grounded before persisting; logs carry identifiers and counts only), typescript-expert — owner: implementer

5. [wave 2, after 1] `server/src/modules/brief/routes.ts` (CRLF).
   - **One named handler** `generateHandler`: `getContext` → `service.generate(workspaceId, req.params.id, req.body?.regenerate ?? false)`.
   - **Register it on both paths** with the same `schema: { params: IdParams, body: GenerateBriefBody }`:
     - `app.post('/pulls/:id/brief', …)` (canonical, AC-7);
     - `app.post('/pulls/:id/brief/generate', …)` (permanent alias, AC-8 / NFR-2).
   - **Absent body:** make `GenerateBriefBody` accept one (e.g. `z.object({ regenerate: z.boolean().optional().default(false) }).optional()` or `.default({})`). Choose the zod-3-correct form and verify by test.
   - Workspace scoping stays in the service (`getPull(workspaceId, …)` first), so both paths 404 a foreign PR (NFR-4c). Both use the singleton `container.briefService`, so they share the in-flight guard (EC-7).
   - Update the header comment: the route table and the "one POST" note now say "one handler, two paths".
   - implements: AC-7, AC-8, EC-3, EC-7, NFR-2 (old path shape), NFR-4c — governed by: onion-architecture (route = validate → one service call; no logic or persistence in the handler), fastify-best-practices (Zod body/params schemas on the route; both paths registered in the same plugin), zod, security (same scoping on both paths) — owner: implementer

6. [wave 2, after 1] `client/src/lib/hooks/brief.ts` (CRLF) + new `client/src/lib/hooks/brief.test.ts`.
   - `useGenerateBrief` posts to `` `/pulls/${prId}/brief` `` (OQ-3); body unchanged (`{ regenerate }`).
   - Update the header and JSDoc comments: canonical path, alias kept server-side.
   - **`brief.test.ts`** (trivial, implementer inline):
     - mock `../api` keeping the real `ApiError` (`vi.importActual`), render the hook in a `QueryClientProvider`, call `mutate({ regenerate: true })`;
     - assert `api.post` was called once with `/pulls/p1/brief` and `{ regenerate: true }`.
   - implements: AC-7 (client caller), OQ-3 — governed by: frontend-architecture (data hooks in `src/lib/hooks`, through `lib/api.ts`), react-best-practices, react-testing-library (test) — owner: implementer

7. [wave 2, after 1, 3] PR Brief card body.
   - **Files:**
     - `.../PrBriefCard/PrBriefCard.tsx` (LF);
     - `.../PrBriefCard/styles.ts` (CRLF);
     - new `.../PrBriefCard/_components/BriefBody/{index.ts,BriefBody.tsx}`.
   - **`BriefBody({ brief }: { brief: PrBrief })`**, `useTranslations("brief")`:
     - **Summary:** if `brief.summary?.trim()`, render `<p style={s.summary} data-testid="brief-summary">{brief.summary}</p>` and **do not** render what/why (A1). Otherwise render today's `<div style={s.title}>{brief.what}</div><div style={s.description}>{brief.why}</div>` with no empty summary element (AC-5 / EC-1);
     - **Missing inputs:** if `brief.missing_inputs?.length`, render `<p style={s.missingInputs} data-testid="brief-missing-inputs">{t("missingInputs.statement", { inputs: brief.missing_inputs.map((k) => t(\`missingInputs.input.${k}\`)).join(", ") })}</p>`. Render nothing for `[]` or `undefined` (AC-13, A5). No `role="status"`;
     - all text is JSX text: no `dangerouslySetInnerHTML`, no `Markdown` (NFR-4b).
   - **`PrBriefCard.tsx`:** replace the inline what/why `<div style={s.body}>…</div>` block in the has-brief branch with `<div style={s.body}><BriefBody brief={brief} /></div>`. Nothing else changes: skeleton, footer, details, navigation and refresh button stay exactly as SPEC-03 left them. The body sits above the footer and details, so the summary is above risks and focus (AC-4).
   - **`styles.ts`:** add `summary` (same scale as `title` but regular weight, `var(--text-primary)`) and `missingInputs` (12px, `var(--text-muted)`). Tokens only.
   - **Existing tests:**
     - `PrBriefCard.test.tsx` / `PrBriefCard.states.test.tsx` fixtures have no `summary`, so they keep rendering what/why. They must stay green with **no edits**; if one fails, stop and report;
     - the sentinel tests load the real `brief.json`, so the new keys are covered automatically.
   - implements: AC-4, AC-5, AC-12 (card), AC-13 (card), EC-1, EC-8, NFR-4b — governed by: frontend-architecture (sub-component folder with an `index.ts` forwarder; strings from the catalogue; styles in `styles.ts`; contract types from `@devdigest/shared`), react-best-practices (derive at render; early branches, no nested ternaries for the summary/legacy split), security (plain-text rendering of untrusted model text) — owner: implementer

8. [wave 3, after 2, 4] Server unit tests for the new behaviour.
   - **Files:**
     - extend `server/test/brief-grounding.test.ts` and `server/test/brief-prompt.test.ts`;
     - new `server/test/brief-facts.test.ts` and `server/test/brief-service.test.ts`.
   - **`brief-grounding.test.ts`:**
     - AC-2: a summary containing `[x](https://evil.test)` and `` `fooBar` `` (not a known symbol) → the link is replaced by `x`, `https://evil.test` is in `dropped.links`, `fooBar` is in `dropped.citations`;
     - AC-1 / EC-2: a 5-sentence summary → 3 sentences;
     - A2: a summary that grounds to empty → the fallback is non-empty and ≤3 sentences;
     - `what`/`why` are still clamped to 2 sentences.
   - **`brief-prompt.test.ts`:**
     - AC-19 / EC-6: a fact set whose **non-droppable** parts (huge PR body/title, many files below 40 with long paths) exceed 8000 after every step → `overBudget === true`, `budget === 8000`, `tokens > 8000`, and the messages are still returned;
     - an in-budget fixture → `overBudget === false`;
     - the system prompt names `summary`.
   - **`brief-facts.test.ts`:** `deriveMissingInputs`:
     - all four missing (EC-8: intent unavailable, issue unavailable, spec unavailable, `indexStatus: 'degraded'`) → `['intent','blast_radius','linked_issue','specs']`;
     - all available (`indexStatus: 'full'`, not degraded) → `[]`;
     - `'partial'` counts as available; `'failed'` and `blast.degraded: true` each count as missing;
     - the order is fixed regardless of which are missing.
   - **`brief-service.test.ts`:** `BriefService` built with structural fakes:
     - a fake repository object cast `as unknown as BriefRepository` (see Open question O1);
     - fake `RepoIntelPort`, `resolveModel`, `llm` returning a counting fake `LLMProvider`, `github`, `readSpec`, the step-2 tokenizer, `estimateCost`, and a capturing `BriefLogger` with `info` and `warn` arrays.
   - **Cases in `brief-service.test.ts`:**
     - AC-15 / EC-9: a successful generate with the fake returning `attempts: 2` → `completeStructured` called exactly once; exactly one `info` line with msg `brief.generate`, carrying `prId, provider, model, attempts: 2, tokensIn, tokensOut, costUsd, dropped.{paths,lines,citations,links,risks,focus}` counts; `JSON.stringify` of the line contains none of the fixture's what/why/summary/issue-body/spec markers;
     - AC-14: `resolveModel` is called with `(workspaceId, 'risk_brief')`; `completeStructured` receives that model; `provenance.model` / `provider` match; a second generate with the resolver now returning another model uses the new one;
     - AC-16: 0 calls for `getPage`, for a cache hit (same head SHA, `regenerate: false`), for a PR with no files (status `refused`), and for a concurrent call while one is in flight (status `generating`; use a deferred promise in the fake LLM, never `Promise.all` races, per `server/LEARNINGS.md` as cited in `service.ts:94-96`);
     - AC-12 / AC-13: the returned and upserted brief carry `missing_inputs` from the facts. All-missing fakes (no intent columns, no issue reference, no spec reference, `getIndexState` → `degraded`) → four names; all-present fakes → `[]`;
     - AC-19: with a tokenizer that always returns 9000 → one `warn` line `brief.input_over_budget` with `tokens: 9000, budget: 8000`, no prose, and the model still called once;
     - NFR-3: the fake LLM throws → status `failed`, one `brief.generate` line with `ok: false, provider, model, prId`, no issue/spec marker; nothing upserted.
   - implements: AC-1, AC-2, AC-12, AC-13, AC-14, AC-15, AC-16, AC-19, EC-2, EC-6, EC-8, EC-9, NFR-1, NFR-3 — governed by: onion-architecture `rules/testing.md` (fakes for ports, unit lane, no DB), typescript-expert — owner: test-writer

9. [wave 3, after 1, 4, 5] Server integration tests. New `server/test/brief.it.test.ts` (Testcontainers; must end in `.it.test.ts`).
   - **Setup:** pattern from `test/onboarding.it.test.ts`:
     - `startPg` + `seed` + `buildApp` with `MockLLMProvider` registered for the `risk_brief` provider; set the workspace `risk_brief` setting explicitly so the provider/model are known;
     - insert `pull_requests` + `pr_files` rows (patch with hunks) for a PR in workspace A, and a second PR in workspace B;
     - a seeded `repo_index_state` row only where a case needs the index "available".
   - **Cases:**
     - AC-1: mock output with a summary → `POST /pulls/:id/brief` returns `generated` with a non-empty `summary` (≤3 sentences); a following `GET` returns the same `summary`;
     - AC-3 / NFR-2 / EC-1: insert a `pr_brief` row whose `json` has only what/why/risk_level/risks/review_focus → `GET` is 200, `BriefPage.parse(body)` succeeds, `brief.summary` and `brief.missing_inputs` are undefined. Both POST paths with a cache hit return a `BriefGenerateResult.parse`-valid legacy body;
     - AC-7 / NFR-4c: canonical POST with `{}`, with `{ regenerate: true }`, and with **no body** → `generated` / schema-valid; workspace B's PR id on the canonical path → 404, and → 404 on the alias too;
     - AC-8 / EC-3 / EC-7: the alias returns the same shape as the canonical path. With a `MockLLMProvider` delay, start a POST on `/brief/generate`, then POST `/brief` before it resolves → the second response is `generating`; after both settle the mock recorded exactly **one** call. Repeat with the paths swapped;
     - AC-12 / EC-8: no intent row, a PR body with no issue/spec reference, no index state → the response `brief.missing_inputs` equals all four names, and a `GET` re-read returns the same list;
     - AC-13: intent row present, PR body references an issue (MockGitHubClient `getIssue` resolves) and a spec path that exists in a tmpdir checkout set as `repos.clone_path`, `repo_index_state` status `full` → `missing_inputs` is `[]`. If the checkout fixture proves impractical, document why in the test and cover the all-present case in step 8 (unit) instead;
     - AC-14: switch the `risk_brief` setting to another model, then regenerate → the mock call and `provenance.model` use the new model;
     - AC-16: `GET` and a cache-hit POST → 0 new mock calls;
     - NFR-3: spy on `console.info`. A success run and a mock-failure run each emit one `brief.generate` object with `ok`, `provider`, `model`, `prId`. An issue-body/spec marker string is absent from every logged argument;
     - NFR-4a: the `MockLLMProvider`-recorded messages contain the PR body/issue body only inside `<untrusted` wrappers, and the system message contains `INJECTION_GUARD`.
   - Check the vitest summary's skipped count (INSIGHTS 2026-09-20).
   - implements: AC-1, AC-3, AC-7, AC-8, AC-12, AC-13, AC-14, AC-16, EC-1, EC-3, EC-7, EC-8, NFR-2, NFR-3, NFR-4a, NFR-4c — governed by: onion-architecture `rules/testing.md` (`*.it.test.ts`, route `inject`, mocks from `adapters/mocks.ts`), fastify-best-practices (`app.inject`), security (cross-workspace 404) — owner: test-writer

10. [wave 3, after 3, 7] Client tests.
    - **Files (new):**
      - `.../PrBriefCard/_components/BriefBody/BriefBody.test.tsx`;
      - `.../PrBriefCard/PrBriefCard.summary.test.tsx`. Kept separate so the existing SPEC-03 test files stay untouched.
    - **Setup:** `NextIntlClientProvider` with the real `brief` namespace, plus `prReview`/`shell` if the card needs them; mock `@/lib/hooks/brief` via the alias; wrap in `ToastProvider` or spy `useToast`; use `fireEvent`. Run by test-name filter (bracket paths, INSIGHTS 2026-10-11).
    - **Cases:**
      - AC-4: a generated page with `summary` → the summary text is present, and its node precedes the Risk areas label after "Show details" (`compareDocumentPosition`); what/why text is absent (A1);
      - AC-5 / EC-1: a legacy page (no `summary`) → what and why are shown and `queryByTestId("brief-summary")` is null; a `summary: "   "` page behaves the same;
      - AC-12 / EC-8: `missing_inputs: ['intent','blast_radius','linked_issue','specs']` → the statement names all four, using catalogue text; with a sentinel catalogue, each `@@missingInputs.input.*@@` sentinel appears;
      - AC-13: `missing_inputs: []` and `undefined` → `queryByTestId("brief-missing-inputs")` is null;
      - NFR-4b: `summary` and what/why containing `<img src=x onerror=alert(1)>` and `<script>` → no `img`/`script` element; the text renders literally;
      - the missing-inputs note has no `role="status"`.
    - implements: AC-4, AC-5, AC-12 (card), AC-13 (card), EC-1, EC-8, NFR-4b — governed by: react-testing-library (repo override: `fireEvent`), frontend-architecture (colocated tests) — owner: test-writer

### File ownership (per wave)
| Wave | Step | Files owned |
|---|---|---|
| 1 | 1 | `server/src/vendor/shared/contracts/brief.ts`; `client/src/vendor/shared/contracts/brief.ts`; `server/test/brief-contract.test.ts` (new) |
| 1 | 2 | `server/test/brief-grounding.test.ts` (new); `server/test/brief-prompt.test.ts` (new) |
| 1 | 3 | `client/messages/en/brief.json` |
| 2 | 4 | `server/src/modules/brief/constants.ts`; `schemas.ts`; `grounding.ts`; `prompts.ts`; `facts.ts`; `service.ts` |
| 2 | 5 | `server/src/modules/brief/routes.ts` |
| 2 | 6 | `client/src/lib/hooks/brief.ts`; `client/src/lib/hooks/brief.test.ts` (new) |
| 2 | 7 | `.../PrBriefCard/PrBriefCard.tsx`; `.../PrBriefCard/styles.ts`; `.../PrBriefCard/_components/BriefBody/index.ts` (new); `.../PrBriefCard/_components/BriefBody/BriefBody.tsx` (new) |
| 3 | 8 | `server/test/brief-grounding.test.ts`; `server/test/brief-prompt.test.ts`; `server/test/brief-facts.test.ts` (new); `server/test/brief-service.test.ts` (new) |
| 3 | 9 | `server/test/brief.it.test.ts` (new) |
| 3 | 10 | `.../PrBriefCard/_components/BriefBody/BriefBody.test.tsx` (new); `.../PrBriefCard/PrBriefCard.summary.test.tsx` (new) |

- `...` = `client/src/app/repos/[repoId]/pulls/[number]/_components`.
- No file appears twice within a wave. `brief-grounding.test.ts` and `brief-prompt.test.ts` are owned by step 2 (wave 1) and step 8 (wave 3), which are different waves.
- The cross-package contract change (both vendored copies) belongs to step 1 alone.
- No step touches `platform/container.ts`, `db/**`, `adapters/**`, other modules, `src/vendor/ui/**`, `mcp-server/**`, `e2e/**`, or the existing `PrBriefCard.test.tsx` / `PrBriefCard.states.test.tsx`.

### Spec coverage
| ID | Priority | Step(s) | Test owner |
|---|---|---|---|
| AC-1 | MUST | 1, 4 | test-writer steps 8 (clamp/fallback), 9 (integration) |
| AC-2 | MUST | 4 | test-writer step 8 |
| AC-3 | MUST | 1 (optional field; jsonb, no migration) | implementer inline step 1 (contract parse) + test-writer step 9 |
| AC-4 | MUST | 7 | test-writer step 10 |
| AC-5 | MUST | 7 | test-writer step 10 |
| AC-6 | MUST | 1 | implementer inline step 1 (`brief-contract.test.ts`) + `check-vendor-shared-sync.sh` |
| AC-7 | MUST | 5, 6 | test-writer step 9; implementer inline step 6 (client path) |
| AC-8 | MUST | 5 | test-writer step 9 |
| AC-9 | MUST | — (already met, `grounding.ts:65-73`) | test-writer step 2 |
| AC-10 | MUST | — (already met, `grounding.ts:142-146`) | test-writer step 2 |
| AC-11 | MUST | — (already met, `grounding.ts:138-141`) | test-writer step 2 |
| AC-12 | MUST | 1, 3, 4, 7 | test-writer steps 8, 9, 10 |
| AC-13 | MUST | 4, 7 | test-writer steps 8, 9, 10 |
| AC-14 | MUST | — (already met, `service.ts:138`; step 4 keeps it) | test-writer steps 8, 9 |
| AC-15 | MUST | 4 (keeps one call + log fields) | test-writer step 8 |
| AC-16 | MUST | — (already met, `service.ts:55-107`; step 4 keeps it) | test-writer steps 8, 9 |
| AC-17 | MUST | — (already met, `prompts.ts:172-184`) | test-writer step 2 |
| AC-18 | MUST | — (already met, `prompts.ts:69-120`) | test-writer step 2 |
| AC-19 | MUST | 4 | test-writer step 8 |
| EC-1 | — | 1, 7 | test-writer steps 9, 10 |
| EC-2 | — | 4 | test-writer step 8 |
| EC-3 | — | 5 | test-writer step 9 |
| EC-4 | — | — (already met) | test-writer step 2 |
| EC-5 | — | — (already met; card text exists) | test-writer step 2 |
| EC-6 | — | 4 | test-writer step 8 |
| EC-7 | — | 5 | test-writer step 9 |
| EC-8 | — | 4, 7 | test-writer steps 8, 9, 10 |
| EC-9 | — | 4 | test-writer step 8 |
| NFR-1 | MUST | 4 (constant unchanged, `overBudget` signal) | test-writer steps 2, 8 |
| NFR-2 | MUST | 1, 5 | implementer inline step 1 + test-writer step 9 |
| NFR-3 | SHOULD | 4 (existing lines kept; prose-free warn) | test-writer steps 8, 9 (scope per A8) |
| NFR-4 | MUST | (a) unchanged `prompts.ts`; (b) 7; (c) 5 | test-writer steps 2, 9 (a, c), 10 (b) |

Every MUST row has an implementing step or a cited already-met code location, plus a test owner.

**Trivial vs deferred test work:**
- *Trivial, inline with the implementer:* step 1 (AC-6 byte equality + legacy parse) and step 6 (hook posts to the canonical path).
- *Test-writer, test-first in wave 1:* step 2 (characterization of the already-met grounding and prompt criteria).
- *Test-writer, deferred until after the code (wave 3):* steps 8, 9 and 10. They cover business logic (grounding, budget, missing inputs), integration flows (routes, concurrency, persistence) and permission rules (workspace scoping).

### Skills the implementer will invoke
From `.claude/skills/pr-self-review/SKILL.md` Phase 4 (loaded at plan time, not copied):
- **`server/src/modules/brief/**` (steps 4, 5):** `onion-architecture`.
  - `routes.ts` (step 5) also needs `fastify-best-practices`.
  - No repository or `db/**` file changes, so `drizzle-orm-patterns` / `postgresql-table-design` do not apply.
- **Files importing `zod` or under `**/vendor/shared/**`** (steps 1, 4 `schemas.ts`, 5): `zod`.
- **`client/src/**` non-test, non-vendor** (steps 6, 7): `frontend-architecture`, `react-best-practices`, `next-best-practices`. `next-best-practices` has little to bite on here: no route/page change.
- **`client/**/*.test.{ts,tsx}`** (steps 6 inline, 10): `react-testing-library` (+ `frontend-architecture` for placement). Repo override: `fireEvent`.
- **Every changed `*.ts`/`*.tsx`:** `typescript-expert`, `security`.
  - `security` matters most for steps 4 (untrusted summary, log privacy), 5 (scoping on the new path) and 7 (plain-text render).
- **`client/messages/**`** (step 3): i18n key-parity check (no skill; only `en` exists).
- **Server tests** (steps 2, 8, 9): `onion-architecture` `rules/testing.md` for fakes and the unit vs `*.it.test.ts` split.

### Verification scope
- **After each wave:** run `bash scripts/verify-changed.sh` from the repo root. It runs typecheck plus `vitest related` (unit lane) for server and/or client, `pnpm arch:check` when `server/src/modules/**` changes, and `check-vendor-shared-sync.sh` when `vendor/shared` changes (wave 1).
  - Record a baseline run before wave 1. Report any failure in files this plan does not own as pre-existing; don't fix it.
- **Integration (step 9 only):** run `cd server && pnpm exec vitest run test/brief.it.test.ts` with Docker. Confirm 0 skipped.
- **Client tests under `[bracket]` paths:** run `cd client && pnpm exec vitest run -t "<test name>"` (or the `PrBriefCard` folder name filter). Never a bracket path.
- **Line endings and encoding,** after every implementer step:
  - `git diff --stat` on the owned files (no whole-file churn);
  - `file <path>` (CRLF/LF unchanged per the Requirements review list);
  - `LC_ALL=C grep -c $'\x97' <path>` = 0.
- **Once at the end:** run `bash scripts/verify-changed.sh --full` (server unit lane + client unit suite, the only packages touched). No reviewer-core or e2e runs.

### Explicitly out of scope
- **Architecture-reviewer:**
  - whether `BriefService` should depend on a `BriefStore` interface in a module `types.ts` instead of the concrete `BriefRepository` (it matters for step 8's fakes; O1);
  - whether `deriveMissingInputs` belongs in `facts.ts` or a new pure helper file. Note: `.dependency-cruiser.cjs`'s INNER regex does not cover `facts.ts`/`grounding.ts`/`prompts.ts` (server `INSIGHTS.md` 2026-09-30); this is pre-existing;
  - whether two POST paths on one handler are the right way to express an alias (vs a redirect).
- **Security-reviewer:**
  - the failure log's `error: err.message` stays as today. Confirm that no adapter error message can carry prompt/issue/spec text (NFR-3);
  - confirm that the new canonical path has the same scoping and body validation as the old one;
  - confirm that summary and missing-inputs rendering is text-only.
- Prompt-side marking of absent issue/spec (R7); OQ-9 UX ideas; run-trace surfacing; any `mcp-server` brief tool; drop-order, caching or bound changes; removing `what`/`why`; e2e flows.
- Docs: no repo doc references `/brief/generate`. Any feature documentation is `doc-writer`'s job after implementation.
- Writing `INSIGHTS.md`: the orchestrator does this once at the end via `engineering-insights`.

### Open questions / assumptions
Each was adopted without an interview (subagent run). Each can be vetoed by the human before approval.
- **A1 (AC-4/AC-5):** when a non-empty `summary` exists, the card body shows the summary **instead of** what/why (literal reading of "show its what and why instead"). What/why stay in the contract and the API but are not rendered. *Alternative if vetoed:* show what/why under the existing `section.what`/`section.why` labels inside "Show details".
- **A2 (AC-1):** if grounding empties the summary, the server substitutes `clampSentences(what + " " + why, 3)`, so a successful generation always returns a non-empty summary.
- **A3 (AC-12):** "missing" means unavailable in the fact set (`available: false`), whether because no reference was found or because the fetch/read failed. An issue body or spec dropped by the budget loop is **not** missing; `dropped_inputs` already records that.
- **A4 (AC-12):** "Blast radius" is missing when `blast.degraded` is true or the index status is `degraded` or `failed` (this includes "no index", which reports `degraded/no_data`). `partial` counts as available.
- **A5 (AC-12/AC-13, legacy):** `missing_inputs` is optional in the contract. Legacy rows (field absent) show no statement, because the server cannot recompute what was missing at generation time.
- **A6 (AC-7):** both POST paths accept an absent body, treated as `regenerate: false`.
- **A7 (AC-15/OQ-5):** adapter defaults for repair and transport retries stay. "One call" is asserted on `completeStructured` invocations from the service, and `attempts` is reported as returned.
- **A8 (NFR-3, SHOULD):** a `ConfigError` raised by `this.llm(provider)` / `resolveModel` before the model call keeps today's behaviour (propagates as an HTTP error, no `brief.generate` line). NFR-3 is met for model-call failures.
- **A9 (AC-19):** the warning is a separate log line with message `brief.input_over_budget` at `warn` level, carrying `prId, provider, model, tokens, budget`.
- **A10:** adding `missingInputs` (enum names only) to the success `brief.generate` log line is optional for the implementer. The ACs neither require nor forbid it.
- **A11:** `BRIEF_MAX_OUTPUT_TOKENS` (1500) is unchanged. A ≤3-sentence summary is assumed to fit; if integration shows truncation, that is a spec-level conversation, not a silent raise.
- **A12 (AC-6 test placement):** the byte-equality test lives in the server unit lane and reads the client copy through a relative path. A client-only contract edit therefore won't trigger it in CI (`server-unit.yml` filters on `server/**`). `check-vendor-shared-sync.sh` (via `verify-changed.sh` and `pr-self-review`) covers that side.
- **O1 (for architecture review):** step 8 fakes `BriefRepository` structurally (`as unknown as BriefRepository`) because the service imports the concrete class (a documented onion compromise). Introducing a repository interface is not part of this plan.
