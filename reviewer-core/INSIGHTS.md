# reviewer-core/ — Insights

Running log of gotchas, tricky bugs, and rationale for non-default decisions in
this module. Linked from [CLAUDE.md](./CLAUDE.md) — not inlined there because
this list is expected to grow and change often (volatile by design).

Format: newest first within each section. One entry = one decision or one
gotcha. Keep entries short; link to code/PR/commit for the full story instead
of re-explaining it here.

---

## What Works

## What Doesn't Work

## Codebase Patterns

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
