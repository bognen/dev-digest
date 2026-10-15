# reviewer-core/ — Insights

Running log of gotchas, tricky bugs, and rationale for non-default decisions in
this module. Linked from [CLAUDE.md](./CLAUDE.md) — not inlined there because
this list is expected to grow and change often (volatile by design).

Format: newest first within each section. One entry = one decision or one
gotcha. Keep entries short; link to code/PR/commit for the full story instead
of re-explaining it here.

---

## What Works

### 2026-10-15 — Number diff lines for the model; never let it count from `@@` headers
Given a raw unified diff, models mis-cite lines: on PR #2 three agents cited one `except: pass` (new lines 336-337) as 319-322 (old-side numbers from the `@@` header), 335-336 and 339-340 (removed lines counted as new). `groundFindings()` cannot catch this because every range still falls inside the hunk. `numberDiffLines()` (`src/diff-numbering.ts`) prefixes each added/context line with its new-file number, applied in `assemblePrompt` with a trusted `LINE_NUMBER_NOTE` outside the `<untrusted>` wrapper; on the re-run all agents cited identical lines for every shared issue. Hunk bodies are tracked by the header's line counts, so a removed line starting with `--` is never mistaken for a file header.

## What Doesn't Work

## Codebase Patterns

### 2026-10-13 — `ReviewInput.temperature` is opt-in; `buildLineIndex` is exported for eval case validation
Eval runs (SPEC-06) pass `temperature: 0`; when absent the structured request has no `temperature` key at all, so normal reviews are byte-identical (`test/run.test.ts`). `buildLineIndex` is exported so the server validates eval expectations against exactly the line set the grounding gate uses — an expectation that passes validation can always be matched.

### 2026-10-12 — renderProjectContext groups documents by type with fixed ### headings
The `## Project context` block is now `### Specs`, `### Docs`, `### Insights`, `### Other` groups (fixed order, empty groups omitted) of per-document untrusted blocks; the group is the document's FIRST path segment (exact match, so `docs.md` or `specs-old/x.md` is `Other`) and documents keep their priority order inside a group. Titles are constants, never built from paths or content, so a document cannot forge a heading outside its `<untrusted>` block. Prompt, server token totals and the skill 'Serializes as' preview all use this one renderer, so they stay byte-identical; tests that count `###` lines must skip lines inside `<untrusted>` blocks.

### 2026-10-10 — OpenRouterProvider: StructuredOutputError and per-request transport options
`completeStructured` throws `StructuredOutputError` (same message as before) whose `details.raw` is the last raw model text, defined NON-enumerable so pino's err serializer and `JSON.stringify` cannot leak repo-derived model output into logs; read it as `err.details.raw` (the server's `rawOutputOf`). The OpenAI SDK client's `maxRetries`/`timeout` are set in the constructor (default 2 / 90s): per-request `transportRetries` and `timeoutMs` only take effect when passed as the SECOND argument to `chat.completions.create` (`{ maxRetries, timeout }`, only when defined, so review runs keep the defaults). `req.maxRetries` is the separate parse-repair loop; 'exactly one call' needs both at 0. Tests: the same `messages` array is mutated across attempts, so record `messages.length` inside the `create` mock.

### 2026-10-10 — `renderProjectContext` is the single Project Context renderer
`prompt.ts` exports `renderProjectContext(docs)` (heading + per-doc `wrapUntrusted('project-doc:<path>')` blocks, null when empty). The server's token totals and the skill 'Serializes as' preview call the same function. `assembly.specs` is the block with the heading sliced off (valid only while the heading is followed by exactly one `\n`). Path escaping applies to the label only; the legacy `specs: string[]` path stays for the external CI runner, and `projectDocs` must never default to `[]` (AC-32 byte-identical prompt).

### 2026-09-24 — Derived intent is framing, not a scope limit — it must never change grounding or scoring
`PromptParts.intent`/`ReviewInput.intent` add a `## Derived intent …` section (`prompt.ts`'s `buildIntentSection`) rendered right after `## PR description`, with a trusted framing line OUTSIDE the `<untrusted>` wrapper that explicitly tells the model out-of-scope items are descriptive only and real defects must still be reported at full severity everywhere in the diff. Confidence only changes the section's HEADER WORDING ("LOWER CONFIDENCE…" vs not) — it is never a number the model sees. Intent is intentionally NOT threaded into `groundFindings`, `scoreFromFindings`, `reduceReviews`, or `countBlockers`: when `parts.intent` is absent OR present-but-empty (`statement` blank and both bullet lists empty), `buildIntentSection` returns `null` and the assembled prompt is byte-identical to before this feature existed — verified by keeping `intent` fully optional through `PromptParts` → `ReviewInput` → `assemblePrompt`'s `promptParts` object rather than defaulting it to an empty object anywhere in the chain.

### 2026-09-16 — `build` is a type-check, not a real build
This package intentionally never emits JS — `npm run typecheck` (`tsc --noEmit`)
doubles as the build. The server consumes reviewer-core's TypeScript **source**
directly via a tsconfig path alias (`@devdigest/reviewer-core` → `../reviewer-core/src`),
compiled in-process by tsx (dev) / vitest (tests). Do not "fix" this to emit a
`dist/` — nothing consumes it, and it would desync from the path-aliased source
the server actually type-checks against.

### 2026-09-16 — Grounding is the mandatory gate, not a best-effort filter
Every finding must cite a real diff line or `groundFindings()` drops it — there
is no fallback path that keeps an ungrounded finding around "just in case." This
is what prevents hallucinated line references from ever reaching the UI.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

---

<!-- Add new entries above this line within the relevant section, newest first. -->
