# client/ — Insights

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

### 2026-10-14 — Global `MutationCache.onError` toasts every failed mutation; inline error UIs duplicate it
`src/app/providers.tsx` builds `new MutationCache({ onError: (err) => notify.error(...) })` with no per-mutation opt-out, so the Export to CI wizard's inline notices (preview/install/zip) show alongside a toast. The CI tab avoids it by surfacing "Remove from CI" errors only via the toast. A fix needs `providers.tsx` to skip `mutation.meta?.silent` and the hooks in `src/lib/hooks/ci.ts` to pass `meta: { silent: true }`.

### 2026-10-14 — CI Runs auto-pull: keep the in-flight guard in a ref owned by the mounted view
`app/ci-runs/_components/CiRunsView/useCiAutoPull.ts` triggers `/ci/refresh` on mount and every 60 s (`CI_RUNS_REFRESH_MS`, an explicit user override of SPEC-07 AC-77). `useMutation().mutate`'s per-call `onSettled` never fires after unmount, so overlap protection (StrictMode double mount, Refresh during a pull) is an `inFlight` ref, not mutation callbacks. A plain `refetchInterval` on `useCiRuns` only re-reads the DB — it doesn't pull new results from GitHub.

### 2026-10-13 — Eval UI lives in `src/components/evals/`; the kit `LineChart` gained an optional `tooltip(index)` prop
The agent Evals tab, the skill Evals tab and `/evals/agents/[id]` all render the shared `EvalsPanel` (cases, KPIs, trend, history, Compare), so it sits in `src/components/evals/`; pure helpers are in `src/lib/eval-format.ts`. `LineChart` had no hover content — `tooltip`/`ariaLabel` were added deliberately (with a Showcase entry). Recharts measures 0×0 in jsdom, so tooltip tests mock `LineChart` and call `tooltip(i)` directly (`MetricTrendChart.test.tsx`).

### 2026-10-11 — PR Brief navigation: focus request in page state, claim-once per nonce, untrusted brief paths
`page.tsx` owns a `focusRequest` ({path, line, nonce}, nonce in a ref so it stays monotonic) set by the brief's `onFocusFile`, switches to the Files tab, and DROPS the request in a `[tab]` effect when the tab is not 'diff' (AC-11: returning to Files must not re-scroll). `DiffTab` keeps the `claim(nonce)` set in a ref (it stays mounted; a late smart-diff load remounts every FileCard, so a per-card guard would scroll twice), `RoleGroup` must open both the group and the per-file override because a controlled FileCard never opens itself, and `FileCard` scrolls via element refs (never selectors built from paths). Brief paths are untrusted model output: match them against `pr.files` with exact `Set.has` (`resolveBriefTarget`) and only offer the external GitHub link when `isSafeRepoPath` passes, because `githubBlobUrl` passes `..` through (`encodeURIComponent('..') === '..'`) and a browser normalises it out of the repo. Timestamp pickers must skip NaN as well as null (`ts > NaN` is always false, so a bad first element blocks every later one).

### 2026-10-10 — Onboarding Tour: generated vs skeleton architecture card; TourSectionCard renders children for `ok` and `requires_generation`
A generated Architecture overview is only the summary markdown + the Mermaid graph (design to_analyze/img_4.png); the deterministic Stack/Structure/Routes lists render only when there is no narrative (the skeleton, AC-25). The server's skeleton sends `architecture.state = 'requires_generation'` with populated facts, so `TourSectionCard` must render the 'Requires generation' note AND the children for that state (gating children on `ok` alone hid the AC-25 facts); `not_available` shows the reason and no children. `MermaidDiagram` renders null on a parse failure, which looks like 'no diagram'. In tests, clear the module-level `vi.mock('mermaid')` spies in `beforeEach` before asserting 'not called', and keep real-mermaid parse tests in their own file (mocked and real mermaid cannot share a file).

### 2026-10-10 — Skill Context tab reorder shares one DndContext with non-sortable rows
`SkillContextTab` keeps attached (sortable) and available (plain) rows in a single `ul` under one `DndContext`/`SortableContext`; the `SortableContext` items list only the attached paths, so unattached `li` rows are simply not sortable. Order comes from the query's `state.attached` (no local state) and a reorder saves immediately through the optimistic `useSetSkillContext` with the new ordered path list; drag is disabled while a filter is active.

### 2026-10-10 — Onboarding Tour: link allowlist and namespace
Every Markdown link in the tour goes through `helpers.tourHref` (exact match against the tour's `link_paths`, after stripping a leading `./` or `/`, then a GitHub blob URL at the stored sha); anything else renders as plain text via the Markdown primitive's `transformHref`, which also sees GFM bare-URL autolinks. `messages/en/onboarding.json` is now the Onboarding Tour namespace (old stub keys removed): don't point the add-repository flow at it.

### 2026-10-10 — Repo-scoped editor tabs use `useActiveRepo().repoId`
`/agents/:id` and `/skills/:id` have no `repoId` param, so the Context tabs read the active repo and render an EmptyState when it is null. Context mutations (`lib/hooks/project-context.ts`) already write the optimistic state to the query cache, so the tab derives rows from the query at render and keeps no local `edits` state (unlike SkillsTab). `useSetSkillContext` must also invalidate every `["agent-context"]` key, because inherited rows depend on skill attachments.

### 2026-10-05 — Blast graph is a hand-laid-out inline SVG; label truncation and layout are pure helpers

BlastGraph (BlastRadiusCard/BlastGraph/) uses no chart/graph lib: `buildGraphLayout` in helpers.ts computes 3-column coordinates, caller cap is `MAX_GRAPH_CALLERS` (client-owned, not the server limit). SVG <a> links need `rel=noopener noreferrer`; the Tree view stays the default and the toggle is hidden when there are no rows.

### 2026-09-30 — Inline findings reach the shared diff-viewer through a render prop
`src/components/diff-viewer` must not import a route's `_components` (FindingCard lives in the PR route), so it takes `DiffFindingApi { anchorsFor, hasOpenFindings, renderFinding(id) }` and the route (`DiffTab`) supplies the card. Anchoring mirrors `partitionThreads`: key `RIGHT:<start_line>`, unmatched ones render in a "Findings outside the visible diff" block (`diff-viewer/findings.ts`).

### 2026-09-30 — Dismissed findings render inline but never count as open
`latestOpenFindingsByPath` (`DiffTab/helpers.ts`) keeps dismissed findings so FindingCard shows them muted, but `hasOpenFinding` ignores them, so the file dot (and not the inline card) disappears once everything is dismissed. Run dedupe is `kind==='review'`, newest first, one per `agent_id ?? id` — same rule as the server smart-diff, keep them in sync.

### 2026-09-30 — DiffViewer rows are keyed by path, not index
Smart/Original toggling reorders and re-partitions the file list; with `key={i}` the FileCard open/closed state stuck to the position and leaked onto a different file. `DiffViewer` now uses `key={f.path}`. Smart-diff query is keyed `["smart-diff", prId, headSha]` and invalidated by `smartDiffKey(prId)` from finding actions and run completion.

### 2026-09-24 — `usePrIntent` composes GET → POST inside `queryFn` itself, not a `useEffect`
The Intent card needs to work before any review has ever run, so `lib/hooks/intent.ts`'s `queryFn` does a plain `GET /pulls/:id/intent` and, only when the response's `unavailable_reason === "not_generated"`, follows up with one `POST` (which derives it) — all inside the same async `queryFn`, so TanStack Query sees ONE query lifecycle (one loading state, one cache entry) instead of the derived-state-via-effect anti-pattern of triggering a second query/mutation from an effect keyed on the first result. `retry: false` is intentional too: a missing provider key or LLM failure is a 200 with `unavailable_reason` set, never a thrown/rejected request, so there is nothing here that a retry would fix.

### 2026-09-20 — Agent tile stats: accept % is legitimately grey until findings have been accepted/dismissed
`AgentCard` colours the accept segment (`<30` crit, `<60` warn, else ok — `AgentCard/helpers.ts`), but `accept_rate` is `null` until an agent's findings have `accepted_at`/`dismissed_at` set, and then it renders a muted "— accept". A fresh dev/seed DB has 52 findings and zero decisions, so every tile looks monochrome next to a mockup that was screenshotted with real triage data — check `select count(*) from findings where accepted_at is not null` before assuming a styling bug. The model-chip tint is `color-mix(in srgb, <color> 12%, transparent)`: the old `color + "1a"` produced invalid CSS for `var(--…)` colours (every model outside `MODEL_COLOR`).

### 2026-09-20 — Agent Skills tab: only linked skills are sortable; the order sent to the server IS the prompt order
`SkillsTab` renders *Enabled* (sortable, grip) then *Available* (static); `toSkillIds` sends only linked ids in list order and `resolveActiveSkills` builds the prompt in that order, so reordering is user-visible in the run trace. A skill that gets flagged for injection after being linked keeps a working toggle (so it can be unlinked) because the server exempts already-linked skills from the 422; a 422 `SKILL_BLOCKED` is already toasted by the global handler, so the tab only unlinks + refetches (a second toast doubled up).

### 2026-09-20 — Trace skills-token badge is approximate by design
`RunTraceDrawer` shows `~{n} tokens` next to "Skills (dynamic)": the server stores `prompt_assembly_meta.skills_tokens` (real tokenizer, js-tiktoken cl100k, over the joined skill bodies only — not the `## Skills / rules` header), and old traces fall back to client-side `ceil(length/4)`, so the two can differ slightly — hence the `~`.

### 2026-09-19 — Skill version diff is a hand-rolled line LCS with a size cap, not a diff library
`SkillVersionsTab/diff.ts` diffs each version's body against the previous one (only bodies can differ — the server snapshots `skill_versions` on body change only). It trims the shared prefix/suffix, then runs an LCS table; if the remaining region exceeds 4M cells `diffLines` returns `null` and the UI shows a "too large to diff" note pointing at the Rendered view (imports can be up to 256 KB, so an uncapped table would allocate ~100 MB). Kept dependency-free on purpose; swap in a real diff lib only if word-level or moved-block diffs are ever needed.

### 2026-09-19 — `messages/en/*.json` files are each auto-loaded as their own i18n namespace; new features can add a file instead of editing a shared one
The loader merges every JSON in `client/messages/en/` under its filename (`skills.json` → `useTranslations("skills")`), so the import drawer's strings live in a new `skillsImport.json` rather than growing `skills.json`. Useful when two people/agents touch one feature's copy concurrently — no merge conflict on a shared file, no loader change needed.

### 2026-09-19 — Agent Skills tab: checkbox = `agent_skills` membership, list order = prompt order, Save is explicit
`AgentEditor/_components/SkillsTab` lists the whole catalog but persists only the linked ids, in list order, via `useSetAgentSkills` (server `setSkills`: `order` = array index). So reordering only *unlinked* rows changes nothing persistent and doesn't enable Save; a globally disabled skill (`skills.enabled: false`) can still be linked but is skipped at run time, hence the dimmed row. Drag is disabled while the filter is active so `arrayMove` indices stay valid.

### 2026-09-19 — Most `page.tsx` files are `"use client"` by design, not oversight — the API is a separate Fastify server, not Next.js server-side data
5 of 7 `page.tsx` files (`app/page.tsx`, `app/onboarding/page.tsx`,
`app/agents/[id]/page.tsx`, `app/repos/[repoId]/pulls/page.tsx`,
`app/repos/[repoId]/pulls/[number]/page.tsx`) fetch client-side via
`lib/hooks/*` (TanStack Query) instead of using React Server Components /
`redirect()` the way a typical Next.js app would. This looks like a missed
optimization on a quick read, but it's deliberate: all data lives behind
`@devdigest/api` (a separate Fastify server at `NEXT_PUBLIC_API_BASE`), not
in Next.js's own server runtime, so there's no RSC-native data-fetching win
here — a server component would still have to make the same HTTP round trip.
More importantly, these pages depend on TanStack Query's client-side cache
and invalidation (SSE-driven review runs, live status updates, optimistic
finding accept/dismiss) — owning the fetch on the client is what makes that
live-update UX work without a manual refetch dance. Converting these to
Server Components would need a parallel client-side re-fetch/subscription
layer anyway, for uncertain benefit. Revisit only if the API moves inside
the Next.js server boundary (e.g. route handlers) or if a specific page's
initial-load latency becomes a measured problem — this is a tradeoff, not
an oversight.

### 2026-09-18 — "Agent runs" tab badge showed the FINDINGS total, not the run count — looked like DB corruption but wasn't
`page.tsx`'s "Agent runs" tab badge (`PrDetailHeader.tsx`) was wired to
`allFindings.length` (`runs.flatMap(r => r.findings).length`, summed across
EVERY review ever created for the PR, including old re-runs of the same
agent) — labeled "Agent runs" but showing a findings total, not a run count.
On a PR where 3 agents had each been run twice, this showed "39" (sum of
findings across all 6 historical reviews) where the user expected "6"
(the actual number of runs) — reported as "the database looks odd," but a
full audit found zero orphaned/corrupted rows; it was a mislabeled client-side
calculation, not bad data. Fixed: the tab now shows `prRuns?.length` (the Timeline's
own run count, one row per `agent_runs` entry) via a renamed `runsCount` prop
— `findingsCount`/`allFindings` still exist for the lethal-trifecta banner,
which legitimately needs a findings total, just not for this tab. Lesson:
before touching data when something "looks wrong," check whether the
underlying data is actually inconsistent (query it) — here the DB was
completely consistent; the bug was a badge counting the wrong thing.

### 2026-09-18 — CORRECTION: severity counts + filter should be ONE merged icon+count row, not two rows
`ReviewRunAccordion.tsx` had a separate, non-interactive severity pill row
(icon+label+count) above `FindingsPanel`'s own filter-button row (icon+label,
clickable) — added per a literal reading of rubric criteria #16 ("counts
row") and #18 ("filter buttons") as two distinct UI elements. User corrected
this: only one row should exist, icon+colored+count, no severity word/label
at all. Removed the `ReviewRunAccordion` pill row entirely; `FindingsPanel`'s
filter pills (`FindingsPanel/styles.ts:severityFilterPill`) now double as the
counter, built from a plain `<button>` (not the generic `Button`, which can't
tint its icon per severity) with the label kept only as `aria-label` for
accessibility. Lesson: when a spec/rubric describes what could be one UI
element described two ways or two separate elements, and the reference
mockup (`img_02.jpg` here) actually showed one merged element, don't default
to "two separate elements" from ambiguous prose — check the mockup again.

### 2026-09-18 — `verdict.findingsCount` had the same hardcoded-plural bug as the popover title fix
`"{count} findings"` (used by both `VerdictBanner.tsx` and `RunHistory.tsx`'s
Timeline click-to-modal title) showed "1 findings" for a single finding — the
same class of bug as the earlier "1 FINDINGS IN THIS RUN" fix, just a
different key. Fixed to `"{count} finding(s)"` (`messages/en/prReview.json`),
covering both surfaces from one shared key. Note: `messages/en/compose.json`
and `runs.json` already use proper ICU plural syntax
(`{count, plural, one {# finding} other {# findings}}`) for the same concept
— a pre-existing inconsistency with this file's "(s)" convention, not fixed
here (out of scope), but worth knowing before adding another count string.

### 2026-09-18 — CORRECTION: `formatTokens` should be ONE abbreviated total, not an in→out pair
Misread "show a specific count, not a range" (user feedback on the Timeline's
new token display) as "show exact numbers instead of abbreviating" — actually
the complaint was that an "in→out" PAIR reads as a range at a glance,
regardless of whether it's abbreviated or exact. The entry directly below
this one (exact comma-separated in→out counts) was itself already a wrong
fix. Correct behavior: `formatTokens(tokensIn, tokensOut)` sums the two into
ONE total and abbreviates it ("13.5k", "12k", or a plain integer under 1000)
— a single figure, not a pair. Lesson: when a user says a display "looks
like a range," the fix is usually to collapse it to one number, not to
change its precision.

### 2026-09-18 — `formatTokens` shows exact counts, not an abbreviation — same lesson as the cost formatter
Per user request, the Timeline's run tiles now show token count to the left
of cost (`RunHistory.tsx`); while wiring that up, `formatTokens` was changed
from an abbreviated "12k→1.5k" to exact, comma-separated counts
("12,000→1,500", via `toLocaleString`) — an abbreviation rounds away real
precision the same way a too-low `formatCost` `minDecimals` did (see the
correction entry below), so fixed it at the shared formatter rather than only
in `RunHistory.tsx`, keeping the trace drawer's token stat consistent too.

### 2026-09-18 — CORRECTION: `formatCost`'s decimal floor must be the SAME everywhere, not opt-in per surface
The entry below this one gave the PR list's COST column its own `minDecimals: 4`
while leaving Timeline/trace-drawer callers on the old default of 2. That broke
the very invariant the formatter's own docstring promised ("a run reads
identically on every surface") — a Timeline run costing e.g. $0.0067 displayed
as "$0.01" (2-decimal rounding), while the PR list showed the precise total,
so manually summing the Timeline's rounded numbers no longer matched the PR
list total and looked like a math bug (it wasn't — the aggregation was
correct, only the *display* precision differed). **Fix:** `minDecimals`
now **defaults to 4** (`lib/format.ts`); `PRRow.tsx` dropped its explicit `4`
since it's now redundant, and `RunHistory.tsx`/`TraceBody.tsx`'s bare
`formatCost(cost)` calls picked up the higher precision for free. Lesson:
when a shared formatter's whole point is cross-surface consistency, change
its *default*, not one call site — an opt-in param is exactly how this drifted.

### 2026-09-18 — `formatCost` grew an optional `minDecimals` param instead of a second formatter
The PR list's COST column needed 4 decimals (`$0.0140`) while the Timeline and
trace drawer keep the original 2-decimals-growing-as-needed behavior.
`formatCost(usd, minDecimals = 2)` (`lib/format.ts`) took an optional param
with the old default preserved, rather than adding a parallel formatter —
existing call sites are unaffected. If a surface needs a different decimal
floor, extend this signature rather than forking it. **Superseded by the
entry above — the "old default preserved" part was the bug.**

### 2026-09-18 — Compact (icon+count, no label) is the default for small/dense severity indicators
Per explicit user feedback, `RunHistory.tsx`'s Timeline severity icons switched
from `SeverityBadge ...` (icon+label+count, e.g. "⚠ WARNING 2") to
`SeverityBadge ... compact` (icon+count only). Non-compact stays reserved for
a summary row that has room to spare, e.g. `ReviewRunAccordion`'s pill row
under the verdict banner. Default new small/dense severity indicators to
`compact` unless there's a specific reason to spell out the word.

### 2026-09-18 — Extracted `FindingPreviewRow` to stop a read-only finding-summary render from forking in two
The PR-list FINDINGS popover and the PR-detail Timeline's per-run findings
modal both needed an identical read-only finding summary (severity badge,
title, category, file:line, confidence%, truncated rationale) and had started
as two near-duplicate inline implementations. Unified into
`src/components/FindingPreviewRow.tsx` (cross-route shared, alongside
`app-shell`/`repo-not-found`/`showcase`), taking a plain data shape rather
than the full `FindingRecord` so either caller (fetched via hook, or passed
directly as props) can use it without adapting types.

### 2026-09-18 — PR-list FINDINGS popover reuses `usePrReviews`, no new endpoint needed
`FindingsPopoverContent.tsx` (PR list's FINDINGS column popover) calls the
existing `usePrReviews(prId)` hook — gated with `enabled` on hover state —
rather than adding a new backend route, since that hook already returns every
review's full `findings` array for a PR (it backs the PR-detail Review-runs
accordion too). Check for an existing hook that already fetches the data
you need before adding an endpoint.

### 2026-09-18 — New `Popover` primitive is hover-triggered, deliberately unlike `Dropdown`
`src/vendor/ui/kit/Popover.tsx` opens/closes on hover, with a shared ~120ms
close-timeout between the trigger and the panel (so moving the cursor from one
to the other doesn't dismiss it) — a different interaction model from
`Dropdown` (click-triggered, closes on outside-click). Needed for the PR-list
FINDINGS column popover (read-only, no actions to protect from an accidental
click-away), so don't reach for `Dropdown` when you actually want hover.

### 2026-09-18 — `vi.mock("@/...")` works fine, same as long relative-path mocks
Confirmed in `PRRow.test.tsx`'s hover-popover test: mocking via the `@/`
tsconfig-path alias (`vi.mock("@/lib/hooks/reviews", ...)`) resolves to the
same module Vite/Vitest would resolve from the real import, so it's a fine
alternative to the long relative-path mocks used elsewhere in this repo —
prefer whichever form matches how the file under test already imports it.

### 2026-09-18 — Severity pill counts track the run's full finding set, not the nested filter
`ReviewRunAccordion.tsx`'s "N CRITICAL · N WARNING · N SUGGESTION" pill row is
computed from `countBySeverity(review.findings)` — the run's complete, unfiltered
findings — never from whatever `FindingsPanel`'s local `hideLow`/`severityFilter`
state currently shows. Deliberate: keeps the counter row a stable, always-accurate
total regardless of what's filtered below it, and avoids lifting `FindingsPanel`'s
local filter state up into the parent for no tested benefit. See
`ReviewRunAccordion.tsx:59-66` and the new `lib/findings.ts:countBySeverity`.

### 2026-09-18 — `Dropdown` hosts arbitrary content via an interface field, not a union
`src/vendor/ui/kit/types.ts`'s `DropdownItemDef` is a plain interface, not a
discriminated union, so adding multi-select checkbox support meant adding one
optional field — `custom?: (close: () => void) => React.ReactNode` — rather than
converting the whole type to a union. `Dropdown.tsx` renders it as one more row
type (`it.custom(...)`), letting a menu host non-row content (e.g.
`RunReviewDropdown`'s `AgentSelectList`) without auto-closing on click.

### 2026-09-18 — Timeline per-tile severity icons reuse already-loaded findings, no backend change
`RunSummary` (the Timeline's `runs` prop) only carries aggregate `findings_count`
and a `blockers` (CRITICAL-only) count — no per-severity breakdown. Rather than
extend the server schema, `FindingsTab.tsx` builds a `run_id -> SeverityCounts`
map from its `runs` prop (actually `ReviewRecord[]`, which already has full
`findings` per review) using `countBySeverity`, and passes it to `RunHistory` as
`severityCountsByRunId`. A tile with no matching review entry (e.g. review not
yet loaded) simply renders no icons — a graceful, non-error fallback.

### 2026-09-18 — Timeline severity icons are static by design (no click/popover)
Confirmed with the user: the homework's informal description suggested a
click-to-open modal on Timeline severity icons, but the graded rubric
(`to_analyze/home_work_requirements.txt`, criterion #16) explicitly says Timeline
tiles show icons "без кліку" (no click) — the interactive read-only findings
preview instead lives on the PR **list** page (criteria #20-21). `RunHistory.tsx`'s
severity badges have no `onClick`/`Popover` wrapper as a result.

### 2026-09-17 — Cost/token formatters live in `lib/format.ts`, not colocated per-feature
`formatCost`/`formatTokens` started folder-local to `RunTraceDrawer/helpers.ts`
(its only consumer). Once the PR-list COST column and the Agent-runs timeline
needed the same formatting, both moved to `src/lib/format.ts` so a run reads
identically on every surface; `RunTraceDrawer/helpers.ts` now just re-exports
them. Check `lib/format.ts` before adding a new local copy of either.

### 2026-09-17 — `formatCost`: `null` and `0` are different facts, not a rounding choice
Unknown cost (no completed run yet, or an unpriced model) renders `—`; a
genuinely free run renders `$0.00` — collapsing the two loses real
information. Below $1 the formatter grows past 2 decimals only as far as
needed to clear a `$0.00` rounding, since real per-run costs here are often a
few hundredths of a cent (`toFixed(2)` alone would show almost every run as
free). See `client/src/lib/format.test.ts` for the pinned values.

### 2026-09-16 — Always import UI via the `@devdigest/ui` barrel
Reaching into a layer file directly (e.g. `src/vendor/ui/primitives/Button.tsx`)
works today but breaks the point of vendoring: the barrel (`index.ts`) is the
only surface the showcase smoke test (`src/test/smoke.test.tsx`) and future
re-vendoring passes actually guarantee. Importing around it causes silent drift
that only surfaces when the vendored copy is refreshed.

### 2026-09-16 — Shared contracts must be mirrored by hand
`src/vendor/shared` here is a separate, hand-copied instance of
`@devdigest/shared` from `server/src/vendor/shared` — there's no workspace or
symlink. A schema change made in one and not the other desyncs request/response
contracts with no compiler error until a runtime mismatch shows up.

## Tool & Library Notes

### 2026-10-14 — `Dropdown` pads its panel 6px; `Toggle` has no accessible name
`@devdigest/ui` `Dropdown` always wraps `custom` content in 6px padding, so a flush designed panel (the 288px "Pick agents to run" picker in `RunReviewDropdown`) needs an inner `margin: -6` wrapper. `Toggle` renders a `role="switch"` with no label of its own — wrap it in a `<label>` with visible text (as `Disagreements.tsx` does for "Show only conflicts") or it fails role/name queries and a11y.

### 2026-10-14 — next-intl `t.rich` here rejects React-element values for plain `{placeholder}` strings
The `ci.json` copy uses `{repo}`-style args; passing JSX through `t.rich` fails the type check in this next-intl version. The wizard uses `t.raw()` plus `ExportCiWizard/renderTemplate.tsx` to splice React nodes into the template.

### 2026-10-11 � Stubbing a slot-taking component in tests: the stub must render the slot
IntentCard now takes a `riskAreas` ReactNode slot; `page.test.tsx` stubbed it as `() => <div>intent-stub</div>`, so Risk areas vanished and an unrelated NFR-5 test failed. Stubs of components with slot props need `({ riskAreas }) => <div>stub{riskAreas}</div>`.

### 2026-10-11 � PrBriefCard collapsed risk header's accessible name now includes the first file ref
Tests matching header buttons with an anchored regex (`/Auth surface T$/`) broke; use `( |$)` or `getByRole('button', { name })` scoping. `Badge` in `vendor/ui` accepts no `data-testid`, so wrap it in a `<span data-testid>` for test hooks (vendor/ui is do-not-touch).

### 2026-10-11 � Check EOLs with `git ls-files --eol`; several client files are CRLF in the working tree
Under `core.autocrlf=true` the index is LF but many working copies are CRLF (RiskArea, styles.ts, OverviewTab, ...), so plan claims like "all LF" can be wrong. `grep` for a carriage return and `file` are unreliable in this Git Bash; edit via a newline-preserving script and confirm `git diff --stat` shows no whole-file churn.

### 2026-10-11 � client vitest and typecheck take ~2 minutes each on this machine
Even `vitest run -t <name>` takes ~110s because it still collects every file. Use `run_in_background` or a 600000ms timeout, never the default 120s foreground call; `-t` filters by test name, not file.

### 2026-10-11  Hook tests that need a QueryClientProvider wrapper must be `.tsx`
The wrapper is JSX, so a plan-named `brief.test.ts` fails to parse; name it `.test.tsx` (as `intent.test.tsx`, `brief.test.tsx` in `src/lib/hooks`). Keep the real `ApiError` via `vi.importActual` when mocking `../api`.

### 2026-10-11 — Testing scroll/focus and brief states in jsdom
jsdom has no layout: mock `Element.prototype.scrollIntoView` and assert the element via `mock.contexts[i]`, never positions; `jsdom` keeps the shorthand `style.outline` for focus-outline assertions. Inline style objects cannot express `:focus-visible`, so merge `fcs.focusOutline` from `onFocus`/`onBlur` state (guard `e.target === e.currentTarget` because React's `onFocus` bubbles). Build patch fixtures with `.join('\n')` and no trailing newline (a trailing newline adds a ctx row). `@devdigest/ui` `Tabs` render buttons, not `role=tab`; `useToast` throws outside `ToastProvider` (spy it); back a mocked `useSearchParams` with `useSyncExternalStore`. Catalogue-sentinel tests (replace every `brief` string with `@@dotted.path@@`) are a cheap proof that no label is hard-coded. `vitest run <path with [brackets]>` finds no files (read as a glob): filter by test name instead, and a full `src/app/repos` run takes ~3 minutes.

### 2026-10-10 — Testing React Query hooks and scroll-spy in jsdom
`ApiError`'s constructor order is `(message, status, code)`; a hook test that mocks `../api` must keep the real class via `vi.importActual` or `instanceof` checks in `onError` break. Inspect a `refetchInterval` function through `queryCache.find(...).options` cast to `{ refetchInterval: (q) => unknown }` (the default type omits it). jsdom has no `IntersectionObserver`, so scroll-spy falls back to click-only: assert the click path only. Native `<button>` keyDown does not become a click in jsdom, so assert `aria-expanded`/`aria-controls` structurally.

### 2026-10-10 — Testing dnd-kit lists and hook-mocked components in jsdom
dnd-kit keyboard reorder cannot be simulated in jsdom (zero rects, `sortableKeyboardCoordinates` never moves the item): assert the handle is focusable and ARIA-named and cover real reorder in e2e. `vi.mock` with a relative hook path silently fails to match from a deeper test file (symptom: 'No QueryClient set'), so mock `@/lib/hooks/...` via the alias. The trace drawer's Prompt assembly is collapsed by default (click it before asserting), and in ContextTab scope queries with `within(getByRole('region', {name}))` because one path can appear in Inherited and Available.

### 2026-10-10 — `Checkbox` primitive: `label` is not the accessible name; Write decodes `\uXXXX`
The vendored `Checkbox` renders a `role="checkbox"` button inside a label, so wrap it in a `role="group"` span with an `aria-label` carrying the document path. Separately, the Write tool decodes `\uXXXX` escapes in JSON message files into literal UTF-8: fine for Next.js messages, but don't rely on keeping ASCII-only escapes.

### 2026-09-30 — `@testing-library/user-event` is not installed in `client/`; use `fireEvent`
Importing it fails to resolve (and `tsc` raises TS2307). Existing tests (`FindingCard.test.tsx`, `DiffTab.test.tsx`) use `fireEvent` from `@testing-library/react`. Adding `user-event` means a `package.json` change, so do it deliberately rather than inside a test-only task.

### 2026-09-20 — `@devdigest/ui` gotchas hit while adding modals, badges and toggles
`Modal` is not a portal: render `ConfirmDialog` as a *sibling* of a clickable or `opacity`-dimmed card (not inside it), or clicks bubble to the card and the dialog inherits the dimming. `IconBtn.onClick` gets no event, so wrap it in a `stopPropagation` span. `Toggle`/`Checkbox` have no `disabled` prop — use `SkillEnabledToggle` (inert + dimmed) and wrap in a `<label>` for an accessible name. The toast has no warning kind. `ToastProvider` already owns a `role="status"` region, so don't add that role to badges. Any test rendering `SkillEnabledToggle` or `InjectionBadge` needs the `skills` namespace in its messages or next-intl logs MISSING_MESSAGE.

### 2026-09-20 — Editing CRLF files from scripts silently normalises them
Many client/server files are CRLF in the working tree. The `Edit` tool preserves CRLF, but Python's default newline handling and `\n`-only node string replaces either rewrite the whole file to LF (a noisy diff) or fail to match. When patching from a script, open with `newline=''` and match `\r\n`; and when writing `\uXXXX`/`\n` escapes through the Write tool or a heredoc, check the escape wasn't emitted as a literal character. `vitest` runs from the package root — `pnpm exec vitest run src/app/agents`, not a path relative to `src/`.

### 2026-09-19 — jsdom's `File`/`Blob` has no `.text()` or `.arrayBuffer()`; archive extraction needs a `FileReader` fallback
Browsers and Node have them, jsdom (vitest env) doesn't, so `extractSkillFile` (`app/skills/_components/ImportSkillDrawer/extract.ts`) reads via `FileReader` when `.arrayBuffer` is missing — otherwise every drawer/extract test throws `file.text is not a function` while the feature works fine in a real browser.

### 2026-09-19 — An exported test helper returning `render(...)` fails typecheck with TS2742 — annotate `RenderResult`
`export function renderWithProviders(ui) { return render(...) }` in `app/skills/_test/harness.tsx` errors ("inferred type cannot be named without a reference to `.pnpm/@testing-library+dom…`") because pnpm's nested path isn't portable. Give it an explicit `: RenderResult` (imported from `@testing-library/react`); `vitest` itself doesn't type-check, so only `pnpm typecheck` catches it.

### 2026-09-19 — The `Write` tool can turn a ` `-style escape in source into a literal NUL byte
Seen while writing `extract.ts`: an escape written into a regex/string landed as a real NUL in the file. Grep for it after generating text-processing code: `grep -rlP '\x00' src`.

## Recurring Errors & Fixes

### 2026-10-14 — PR-page "no fetch" test breaks when `PrDetailHeader` gains a data hook
`app/repos/[repoId]/pulls/[number]/page.test.tsx` asserts no network request; mounting `MultiRunResultsButton` (calls `useLatestMultiRun`) in `PrDetailHeader` made it fail. Fix: `vi.mock("@/lib/hooks/multi-agent", …)` in that test. Any new React Query hook rendered in the PR header needs the same mock there.

### 2026-10-14 — Moving a component folder silently breaks its tests' relative paths
When `RunTraceDrawer`/`FindingCard` moved from `app/repos/[repoId]/pulls/[number]/_components/` to `components/review/`, their tests' relative `messages/en/*.json` imports and relative `vi.mock("../../…/lib/hooks/…")` paths broke (4 fewer `../` segments). A wrong `vi.mock` path doesn't error — the real module loads and the test fails or fetches for an unrelated-looking reason. After any move, grep the moved tests for `../` and prefer `@/` aliases in `vi.mock`.

### 2026-10-15 — Correction: CI Runs auto-pull guard got stuck; release it from the `mutateAsync` promise
Supersedes the 2026-10-14 "keep the in-flight guard in a ref" entry: clearing that ref in `mutate`'s per-call `onSettled` broke under StrictMode (mount → unmount → mount detaches the MutationObserver, so per-call callbacks never fire), leaving the guard `true` so every 60 s pull and the Refresh button silently no-op'd until a reload. `app/ci-runs/_components/CiRunsView/useCiAutoPull.ts` now calls `mutateAsync(...).finally(() => inFlight.current = false)`; the hook-level `onSuccess` invalidation still runs because it lives on the mutation, not the observer.

### 2026-10-15 — A value import from `@devdigest/shared` breaks the Next build: "Can't resolve './contracts/findings.js'"
Client code may only `import type` from `@devdigest/shared`: a value import (e.g. `ciAgentDir`) makes webpack bundle the vendored `src/vendor/shared/index.ts`, whose `./contracts/*.js` specifiers it cannot resolve. `pnpm typecheck` and vitest both pass, so only `next dev`/`next build` shows it. Mirror the small helper locally instead, e.g. `agentDir` in `app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportCiWizard/helpers.ts`.

### 2026-10-13 — Tests that render FindingCard must mock `@/lib/hooks/eval`
FindingCard renders `EvalCaseButton` (SPEC-06), which uses TanStack Query hooks; without a QueryClient every test rendering FindingCard, FindingsPanel, DiffTab or ReviewRunAccordion throws. Add `vi.mock("@/lib/hooks/eval", () => ({ useEvalCaseSources: () => ({ data: [] }), useCreateCaseFromFinding: () => ({ mutate: vi.fn(), isPending: false }) }))`. Keep hints in `title`, not `aria-label`: an aria-label ending "…Accept or dismiss the finding first" matched `getByRole("button", { name: /accept/i })` in the FindingsPanel tests.

### 2026-10-13 — Testing Library placeholder queries never match a multi-line placeholder
The default normalizer collapses whitespace in the query, so `getByPlaceholderText` cannot find a textarea whose placeholder contains newlines (the eval case editor's Diff box). Select it structurally (`document.querySelector("textarea")`) or give it an accessible label.

### 2026-10-10 — Multi-file bash heredocs fail silently
A bash call creating several files with `cat <<'EOF'` (apostrophes, nested `python` heredocs, `$'\r'`) failed with `unexpected EOF while looking for matching` and created nothing. Use the Write tool for new files and byte-level Python for CRLF-preserving edits.

### 2026-10-05 — Agent edits turned em dashes into raw 0x97 bytes and flipped CRLF to LF
While building the Blast Radius card, an implementer pass wrote cp1252 `0x97` instead of UTF-8 `E2 80 94` into `BlastRadiusCard/constants.ts` (banner text rendered as a replacement character, invisible to typecheck and vitest) and the `Edit` tool silently converted CRLF files to LF. After any agent edits a file with non-ASCII text, run `LC_ALL=C grep -c $'\x97' <file>` and `git diff --stat` for whole-file line-ending churn; fix by rewriting the bytes, not the text.

### 2026-09-20 — Skill Config tab's Save wrote a stale `enabled` back over a toggle flipped elsewhere
Three surfaces edit `skills.enabled`: the `/skills` list toggle and side-panel toggle (both PUT `{enabled}` immediately) and the Config tab, which copies it into local state once per `skill.id` and always sends it on Save. Enabling from the list and then saving the open Config tab re-disabled the skill (`test-coverage-nudge` sat at `enabled=f, version=3`). Fixed with a second effect keyed on `skill.enabled` in `SkillConfigTab.tsx`. Any form that holds a server-owned flag in local state AND sends it on save needs this re-sync. Related: the agent Skills tab's "N of M enabled" counts `agent_skills` links, not `skills.enabled`, so a globally disabled skill still counts.

### 2026-09-18 — `useDeleteReview` invalidated only its own cache key, leaving the Timeline stale
`useDeleteReview` (`lib/hooks/reviews.ts`) only invalidated `["reviews", prId]`
after deleting a review — not `["pr-runs", prId]`, the Timeline's query.
`pr-runs` only auto-refetches while a run is `status=running`
(`refetchInterval`), so after a review delete the Timeline kept showing a
stale tile until an unrelated refetch happened, even once the server-side fix
(see `server/INSIGHTS.md`, same date) made `reviews`/`agent_runs` consistent.
`useDeleteRun` already invalidated both keys correctly — `useDeleteReview` was
the asymmetric one. Fixed to invalidate both. **Lesson:** when two React Query
cache keys represent overlapping/related server state, check that EVERY
mutation touching either table's data invalidates BOTH keys, not just the one
whose data it most directly changed.

### 2026-09-18 — A hover-triggered panel clipped by an `overflow: hidden` ancestor: portal it, and re-attach hover handlers on the portaled element
`Popover.tsx` was first built like `Dropdown` — an absolutely-positioned panel
nested in the trigger's own DOM subtree. On the PR list, that panel got
clipped by `pulls/styles.ts`'s `tableCard.overflow: "hidden"` (used for the
table's rounded corners). Fix: render the panel via
`createPortal(..., document.body)`, `position: fixed`, computed from
`getBoundingClientRect()` on open. Gotcha: once portaled, the panel is no
longer a DOM descendant of the trigger, so `mouseenter`/`mouseleave` no longer
bubble/contain across the two — attach the SAME open/close handlers on both
the trigger wrapper and the portaled panel (sharing one close-timeout ref),
or moving the cursor from trigger to panel closes it instantly. If a future
overlay needs to render inside a clipped/`overflow:hidden` container, portal
it and don't assume hover state travels through the React tree the way DOM
nesting would provide it for free.

## Session Notes

## Open Questions

### 2026-10-14 — CI tab "Fail CI on" shows 3 segments but `CiFailOn` has 4 values
The design's segmented control is Critical / Warning + / Never; the contract also has `any`. An agent set to `any` on the Config tab renders with no segment selected on the CI tab (`CiTab/_components/FailOnCard`). Decide whether to add a 4th segment (breaks the design) or map `any` onto one of the three.

---

<!-- Add new entries above this line within the relevant section, newest first. -->
