# Development Plan: PR Brief polish
Spec: client/specs/2026-10-11-pr-brief-polish.md
Status: approved

## Development Plan: PR Brief polish

### Requirements review
**Source reviewed:** `client/specs/2026-10-11-pr-brief-polish.md` (SPEC-03, `Status: approved`, so it can be planned). I checked its provenance claims against the code on 2026-10-11. They hold: `page.tsx:158` discards file/line; `DiffTab` has no focus prop; `VerdictBanner` is rendered only in `ReviewRunAccordion.tsx:138-148`; `PrBriefCard.tsx:62` shows a skeleton only for `isLoading || !page`; `PrBriefCard.tsx:54` hard-codes the toast fallback; brief strings are in `client/messages/en/brief.json`; the banner uses the `prReview` namespace.

**Extra facts found in the code (the plan depends on them):**
- `RunSummary` (`client/src/vendor/shared/contracts/trace.ts:132-153`) has `status` (`running | done | failed | cancelled`) and `ran_at`. So OQ-7 is resolved: AC-19 can be done client-only, with no contract change.
- `FileCard` (`client/src/components/diff-viewer/FileCard/FileCard.tsx:65-67`) is uncontrolled in Original order and controlled by `RoleGroup` overrides in Smart order (`RoleGroup.tsx:31-34`). A collapsed `RoleGroup` does not render its `DiffViewer` at all (`RoleGroup.tsx:72`).
- The diff-viewer uses the `shell` namespace. Its existing no-diff text (`shell.diffViewer.noDiffText`) is not in the brief catalogue, so the AC-8 text has to be passed in from the route.
- There is a precedent for "target + nonce → open + scroll": `FindingsTab.tsx:179` → `ReviewRunAccordion.tsx:39-50`. This plan follows that pattern.
- `Markdown` (`client/src/vendor/ui/primitives/Markdown.tsx`) uses `react-markdown` + `remark-gfm` without `rehype-raw`. Raw HTML is already off, so AC-30 needs a test, not a code change.
- `MonoLink` with `href` already sets `rel="noopener noreferrer"` (`MonoLink.tsx:27-30`), which covers NFR-4c.
- `brief.json`, `page.tsx`, `ReviewFocusList.tsx`, `RiskArea.tsx`, `RoleGroup.tsx`, `OverviewTab.tsx`, `DiffViewer.tsx`, diff-viewer `helpers.ts`/`index.ts` and `PrBriefCard.test.tsx` use **CRLF**. `PrBriefCard.tsx`, `DiffTab.tsx`, `FileCard.tsx` and `CodeLine.tsx` use **LF**. Most of these files contain non-ASCII characters (`…`, `—`, `−`).

**Clarifications:** `AskUserQuestion` was not available in this run. Following the caller's instruction, I used single-agent mode and adopted each spec Open question's stated default (OQ-1, OQ-3, OQ-4, OQ-5, OQ-6, OQ-8, OQ-9, OQ-11, OQ-12; OQ-7 resolved above; OQ-2/OQ-10/OQ-13 stay out of scope). They are listed as vetoable assumptions under "Open questions / assumptions".

**Recommended improvements to the requirements (for the spec owner; I did not edit the spec):**
- R1 [non-blocking] AC-20 does not say how the reviews list learns that a run finished when the run was started outside this page. Today reviews are refetched by `FindingsTab.onRunDone` and `useRunReview.onSuccess`, and the brief's Run Review control already switches to the Findings tab. Assumed: the banner derives reactively from the `["reviews", prId]` cache, with no new polling. *Adopted as an assumption.*
- R2 [non-blocking] AC-19 can be done: the "newest run" is the `RunSummary` with the greatest non-null `ran_at`. Recommend that the spec name this field. *Adopted.*
- R3 [non-blocking] AC-8's message has the same meaning as the existing `shell.diffViewer.noDiffText`. Plan: on the targeted card only, show the brief-catalogue message (role="status") in place of the shell text. *Adopted.*
- R4 [non-blocking] AC-9/EC-8 cannot be triggered from the UI today, because the brief is only on Overview. It is verified at the `DiffTab` level by changing the focus prop. *Adopted.*
- R5 [non-blocking] AC-22's "no literal English" should exclude punctuation separators (` — ` in the status line, `:` in `file:line`). *Adopted as an assumption.*
- R6 [non-blocking] NFR-1 (SHOULD) needs a seeded e2e PR. The work is client-only and `test-writer` never writes e2e flow JSON, so NFR-1 is met by design (synchronous lookup, no network) and verified manually. *Adopted.*
- R7 [non-blocking] If the smart-diff query resolves after a navigation, the diff tree switches from flat to groups and remounts `FileCard`s. Without a guard the scroll would run twice. The plan adds a per-`DiffTab` "claim once per nonce" guard. *Adopted.*
- R8 [non-blocking] jsdom cannot turn Enter/Space on a native `<button>` into a click (`client/INSIGHTS.md` 2026-10-10). AC-26 is checked structurally (native `<button type="button">`, no negative tabIndex, click works). Real keyboard behaviour is checked in the NFR-2 manual pass. *Adopted.*

**Execution mode:** single-agent, because `AskUserQuestion` was unavailable. No subagents were used.

### Scope
Client-only polish of the PR Brief on the PR page (`client/src/app/repos/[repoId]/pulls/[number]/`) and the shared diff viewer (`client/src/components/diff-viewer/`):
- one "go to file/line in the diff" behaviour for Review focus items and risk file refs, with exact-path matching, nearest-hunk fallback, no-diff handling, highlight, focus and reduced motion;
- an inline "File not in this PR's diff" message;
- a skeleton plus a polite live region during every generation, a failure status line, and the toast fallback taken from the catalogue;
- a latest-review `VerdictBanner` at the top of Overview, with a "newest run failed" notice;
- the new strings in `brief.json`.

Not covered: server, vendored `@devdigest/shared` (both copies), `@devdigest/ui` (`src/vendor/ui/**`), the brief contract (`summary`, OQ-2), rename detection (OQ-10), e2e flows, and other pre-existing hard-coded strings on the PR page (OQ-12).

### Modules affected
- **client** only:
  - the PR route `_components` (PrBriefCard, OverviewTab, DiffTab + RoleGroup), the route `page.tsx` wiring, and `messages/en/brief.json`;
  - the shared `src/components/diff-viewer` (FileCard, CodeLine, DiffViewer, a new `focus.ts`, styles, barrel), because the focus target has to reach the cards.
- **server / reviewer-core / e2e / mcp-server:** not touched. No vendored-contract change was needed. If an implementer finds one unavoidable, it is a spec conflict and must be escalated, not done.

### Architectural constraints
- `client/AGENTS.md`:
  - pages are thin and feature logic sits in colocated `_components/<Name>/` folders, each with a test;
  - always import UI from the `@devdigest/ui` barrel;
  - every data hook goes through `src/lib/api.ts`;
  - component tests never touch the API or a browser;
  - `src/vendor/ui/**` and `src/vendor/shared/**` are do-not-touch (this plan touches neither).
- `frontend-architecture`:
  - `src/components/**` must never import a route's `_components`. The diff-viewer receives the focus target through a plain API object (`DiffFocusApi`), the same way `DiffFindingApi` works (`client/INSIGHTS.md` 2026-09-30, "Inline findings reach the shared diff-viewer through a render prop");
  - pure logic goes in `helpers.ts` / a domain-named module (no `utils.ts`);
  - a hook used by one component sits in that component's folder;
  - strings live in `messages/en/*.json`;
  - styles live in `styles.ts` using `var(--…)` tokens.
- `client/INSIGHTS.md`:
  - "DiffViewer rows are keyed by path, not index" (2026-09-30): keep `key={f.path}`, and match focus targets by path, never by index;
  - "`Modal` is not a portal", and "`ToastProvider` already owns a `role="status"` region" (2026-09-20): tests must scope `role="status"` queries with `within(...)`, and no `role="status"` goes on badges;
  - "`@testing-library/user-event` is not installed; use `fireEvent`" (2026-09-30). This overrides the generic `react-testing-library` advice;
  - "mock `@/lib/hooks/...` via the alias" (2026-10-10 and 2026-09-18);
  - jsdom has no `IntersectionObserver`, no `scrollIntoView` and no `matchMedia`, and cannot simulate scroll layout (2026-10-10). Tests stub `Element.prototype.scrollIntoView` and `window.matchMedia`;
  - CRLF churn and non-ASCII corruption (2026-09-20, 2026-10-05): preserve each file's existing line endings, and after editing check `git diff --stat` for whole-file churn and `LC_ALL=C grep -c $'\x97' <file>` for cp1252 dashes. The `Edit` tool may flatten CRLF, so check with `file <path>` before and after;
  - `messages/en/*.json` are auto-loaded namespaces (2026-09-19): additive keys only;
  - an exported test helper returning `render(...)` needs `: RenderResult` (2026-09-19).
- The Project Context / Onboarding Tour work is uncommitted in the same tree (`src/vendor/ui/nav.ts`, `src/lib/hooks/index.ts`, `src/vendor/shared/index.ts`, `src/lib/hooks/core.ts`, `Showcase.tsx`, `Markdown.tsx`, …). **This plan edits none of those files.** No step touches `lib/hooks/**`.

### Steps

0. [wave 0] **Cross-model review — orchestrator action, no code.**
   - **What to send:** the plan file `docs/plans/2026-10-11-pr-brief-polish-plan.md`, together with the spec `client/specs/2026-10-11-pr-brief-polish.md` as context, to a reviewer running on a different model family from the planner.
   - **What to ask:** spec-coverage gaps, wave/file-ownership conflicts, conflicts with `client/AGENTS.md` / `client/INSIGHTS.md`, and the assumptions A1-A12.
   - **What to record, in the orchestrator's run notes (not in this plan; it may only change while `draft`):** reviewer model id, date, each finding (id, summary, severity), the decision per finding (accept / reject + reason), and whether the human must re-approve the plan because of an accepted finding.
   - Do not start wave 1 until this is recorded.
   - implements: — (process gate) — governed by: — — owner: orchestrator

1. [wave 1] `client/messages/en/brief.json`
   - **Change:** additive keys only:
     - `generate.error`: "Couldn't generate the brief."
     - `navigation.notInDiff`: "File not in this PR's diff"
     - `navigation.noDiff`: "No diff available for this file."
     - `navigation.openExternal`: "Open on GitHub"
     - `navigation.targetMarker`: "Brief target"
     - `banner.latestRunFailed`: "The most recent review run failed — showing the latest completed review."
   - Reuse the existing `status.generating` ("Generating the brief…") for the AC-15 live region and `status.failed` for the AC-14 status line.
   - **Encoding:** the file is CRLF + UTF-8. Keep both, write real UTF-8 `…`/`—` (not `\u` escapes, not cp1252), and change no existing key.
   - implements: AC-22, AC-23, AC-24, AC-15, AC-14 (strings) — governed by: frontend-architecture (strings in `messages/en`) — owner: implementer

2. [wave 1] Pure helpers, three new or extended modules with these exact signatures (test-writer step 3 writes against them):
   - **a. `client/src/components/diff-viewer/focus.ts` (new)**
     - Types:
       - `DiffFocusTarget = { path: string; line: number | null; nonce: number }`
       - `DiffFocusApi = { target: DiffFocusTarget | null; noDiffLabel: string; targetMarkerLabel: string; claim(nonce: number): boolean }`
       - `FocusResolution = { kind: "no_diff" } | { kind: "header" } | { kind: "line"; index: number } | { kind: "hunk"; index: number }`
     - `resolveFocusLine(lines: Line[], line: number | null): FocusResolution` (uses `Line` from `../helpers`). Rules:
       - `lines` empty → `no_diff`;
       - `line === null` → `header`;
       - otherwise the index of the first non-hunk line with `newNo === line` (add/ctx; del lines have no `newNo`) → `line`;
       - otherwise the hunk header nearest to `line`, measured against each hunk's new-side `[min newNo, max newNo]` range (distance 0 inside, else the distance to the closer edge; ties → earlier hunk) → `hunk`;
       - a non-finite `line` → the first hunk;
       - no hunk header at all → `header`.
     - `scrollBehaviorFor(win: { matchMedia?: (q: string) => { matches: boolean } } | undefined): ScrollBehavior` → `"auto"` when `matchMedia` exists and `"(prefers-reduced-motion: reduce)"` matches, else `"smooth"`.
     - No React or DOM imports apart from these types.
   - **b. `.../_components/PrBriefCard/helpers.ts` (extend; keep `splitFileRef`)**
     - `resolveBriefTarget(filePaths: ReadonlySet<string>, file: string, line: number | null | undefined): { kind: "in_diff"; path: string; line: number | null } | { kind: "not_in_diff" }`.
     - Exact `Set.has(file)` only. No trimming, case-folding, or URL/route building. `line` passes through (`undefined` → `null`).
   - **c. `.../_components/OverviewTab/helpers.ts` (new)**
     - `selectLatestReview(reviews: readonly ReviewRecord[]): ReviewRecord | null` → among `kind === "review"` with `verdict != null`, the greatest `Date.parse(created_at)`; ties → first in input order; the input array is never mutated.
     - `isNewestRunFailed(runs: readonly RunSummary[] | undefined): boolean` → the run with the greatest non-null `ran_at` has `status === "failed"`; runs with null `ran_at` are ignored; empty/undefined → `false`.
     - `countBlockers(findings: readonly FindingRecord[]): number` → same rule as `ReviewRunAccordion.tsx:56` (CRITICAL and not dismissed). The accordion itself is not refactored.
   - **Encoding:** diff-viewer `helpers.ts` is CRLF; new files may be LF but must be UTF-8.
   - implements: AC-3, AC-4, AC-17, AC-19, AC-21 (support), AC-27, AC-29, EC-2, EC-6, EC-13, NFR-4a — governed by: frontend-architecture (pure logic in domain-named modules next to their consumer; contract types from `@devdigest/shared`, never redeclared), security (paths matched only, never turned into URLs) — owner: implementer

3. [wave 1, test-first] Unit tests written from the ACs and the signatures in step 2 (they fail until step 2 lands, which is expected):
   - **`client/src/components/diff-viewer/focus.test.ts`**
     - AC-4: a patch with hunks at known new-side ranges; a line below, between and above them → the nearest `hunk` index, with ties going to the earlier hunk;
     - an in-hunk add or ctx line → `line`;
     - `null` → `header`;
     - empty/`null` patch → `no_diff`;
     - a deleted-file patch (only `-` lines) → `hunk` (EC-6);
     - negative, huge, non-integer and `NaN` lines → `hunk`, without throwing;
     - AC-27: `scrollBehaviorFor` with reduce → `"auto"`, with no preference → `"smooth"`, with no `matchMedia` → `"smooth"`.
   - **`.../PrBriefCard/helpers.test.ts`**
     - AC-29: `../x`, `javascript:alert(1)`, a case-variant, a trailing-slash variant, an old (renamed-away) path and `""` → `not_in_diff`;
     - an exact path → `in_diff` with its line;
     - also cover the existing `splitFileRef` with `a.ts:12`, `b.ts` and `c:d`.
   - **`.../OverviewTab/helpers.test.ts`**
     - AC-17: mixed `summary`/`review` kinds, null verdicts, several agents, unsorted and equal timestamps → the expected record; empty list → `null` (AC-18);
     - AC-19: newest-by-`ran_at` failed → `true`; newest done/cancelled/running → `false`; null `ran_at` ignored;
     - `countBlockers` excludes dismissed and non-CRITICAL findings.
   - Use vitest + plain fixtures. Run from the package root (`pnpm exec vitest run <path>`).
   - implements: AC-4, AC-17, AC-18 (selector), AC-19 (selector), AC-27, AC-29, EC-2, EC-6, EC-13, NFR-4a — governed by: react-testing-library (mostly N/A: pure units), frontend-architecture (colocated `*.test.ts`) — owner: test-writer

4. [wave 2, after 2] Diff-viewer focus behaviour: `client/src/components/diff-viewer/FileCard/FileCard.tsx`, `CodeLine/CodeLine.tsx`, `DiffViewer/DiffViewer.tsx`, `styles.ts`, `index.ts`.
   - **`DiffViewer`:** new optional prop `focus?: DiffFocusApi`, passed through to every `FileCard`. Keep `key={f.path}`.
   - **`FileCard` (new optional prop `focus?: DiffFocusApi`):**
     - `isTarget = focus?.target?.path === file.path`;
     - `resolution = resolveFocusLine(lines, target.line)`, derived at render;
     - when uncontrolled (`controlledOpen === undefined`) and a new target nonce arrives for this file, set local open to `true` using React's "adjust state when a prop changes" pattern (store the last-seen nonce in state; no `useEffect`). When controlled, the parent (`RoleGroup`, step 6) opens it, so `FileCard` never calls `onToggle` for focus (this avoids a double toggle);
     - one `useEffect` keyed on `[target nonce, open, resolution]`, which syncs to the DOM (an external system, like the existing `pendingJump` effect at `FileCard.tsx:98-103`). When `isTarget && open && focus.claim(nonce)`: pick the element from **refs** (header ref / the target `CodeLine` row ref / the target hunk row ref; never `querySelector` or `getElementById` with a path), call `scrollIntoView({ behavior: scrollBehaviorFor(window), block: "center" })`, then `focus({ preventScroll: true })`;
     - the header `div` gets `ref` and `tabIndex={-1}`, with a visible focus outline style;
     - when `resolution.kind === "no_diff"` and the file is the target, render `<div role="status">{focus.noDiffLabel}</div>` in place of the shell `noDiffText`, and focus/scroll the header (AC-8).
   - **`CodeLine`:** new optional props `rowRef?: React.Ref<HTMLDivElement>` (React 19 ref-as-prop) and `highlighted?: boolean`.
     - When `rowRef` is set, the row (or the hunk `div` for `kind === "hunk"`) gets `tabIndex={-1}`.
     - When `highlighted`: `aria-current="location"`, a highlight background **plus** a non-colour marker (an `Icon` glyph with `aria-label={targetMarkerLabel}`, passed in as a prop) and an outline.
     - Highlight only for `resolution.kind === "line"` on the target card, so exactly one line in the page is highlighted. It is derived, not stored, and lasts while the target persists (OQ-3).
   - **`styles.ts`:** highlight / focus-outline styles using `var(--…)` tokens only.
   - **`index.ts`:** additionally export `type DiffFocusApi, DiffFocusTarget` and `resolveFocusLine` from `./focus`. Additive.
   - **Existing tests:** keep `DiffTab.test.tsx` green with no assertion changes. All new props are optional.
   - **Encoding:** `FileCard.tsx`/`CodeLine.tsx`/`styles.ts` are LF; `DiffViewer.tsx`/`index.ts` are CRLF. Preserve each, and keep the UTF-8 `−` in `FileCard.tsx:126`.
   - implements: AC-2, AC-3, AC-4, AC-8, AC-10, AC-25, AC-27, NFR-2(b,d,e), NFR-3, NFR-4a, EC-3, EC-4, EC-5, EC-6, EC-7 — governed by: frontend-architecture (`src/components` gets data through an API object, never imports route `_components`; styles in `styles.ts`), react-best-practices (derive the highlight and resolution at render; the only effect syncs DOM scroll/focus; no derived state in `useState`), security (no DOM selectors built from untrusted paths) — owner: implementer

5. [wave 2, after 1-2] Brief-side navigation: `.../PrBriefCard/useBriefNavigation.ts` (new), `.../PrBriefCard/ReviewFocusList.tsx`, `.../PrBriefCard/RiskArea.tsx`, `.../PrBriefCard/_components/NotInDiffNotice/{index.ts,NotInDiffNotice.tsx}` (new), `.../PrBriefCard/styles.ts`.
   - **`useBriefNavigation(files: readonly PrFile[] | undefined, onFocusFile?: (file: string, line: number | null) => void)`**
     - Returns `{ canNavigate: boolean; notInDiffKey: string | null; navigate(key: string, file: string, line: number | null | undefined): void }`.
     - `canNavigate = !!files && !!onFocusFile`.
     - Build the path `Set` from `files` (memoised on `files`).
     - `navigate` calls `resolveBriefTarget`. On `not_in_diff` → `setNotInDiffKey(key)` and do not switch tabs. On `in_diff` → `setNotInDiffKey(null)` and `onFocusFile(path, line)`.
     - No network calls (NFR-5).
   - **`ReviewFocusList`:** new optional props `onNavigate?: (key: string, file: string, line: number | null) => void` and `notInDiffKey?: string | null` (no key prefix; keys are `focus:${i}`).
     - When `onNavigate` is set, each item is a native `<button type="button">` that calls `onNavigate(\`focus:${i}\`, item.file, item.line)`.
     - Render `<NotInDiffNotice>` inside that `<li>` when `notInDiffKey` matches.
     - Without `onNavigate`, keep today's `MonoLink` fallback.
     - The existing `onFocusFile` prop stays for now as a deprecated temporary shim (see "Existing tests" below). Step 8 removes it once `PrBriefCard` goes through the hook.
   - **`RiskArea`:** new optional props `navKeyPrefix?: string` (default `"risk"`), `onNavigate?`, `notInDiffKey?`.
     - The header button keeps toggling `aria-expanded` and never navigates (AC-6).
     - When `onNavigate` is set, each file ref is a native `<button type="button">` showing the raw ref text. It calls `onNavigate(\`${navKeyPrefix}:${ref}\`, file, line ?? null)` using `splitFileRef`.
     - When `notInDiffKey` matches, render `<NotInDiffNotice>` next to that ref with an `externalHref` from the existing `githubBlobUrl` (only when `repoFullName && headSha`; OQ-9). It is rendered through `MonoLink`, which already sets `rel="noopener noreferrer"`.
     - Without `onNavigate`, keep today's `MonoLink` links.
   - **`NotInDiffNotice`:** props `{ externalHref?: string }`. Renders `<span role="status">{t("navigation.notInDiff")}</span>` plus an optional `MonoLink` labelled `t("navigation.openExternal")`. Uses the `brief` namespace.
   - **`styles.ts`:** style objects for the ref buttons and the notice. Tokens only.
   - **Text rendering:** all brief text stays JSX text; the explanation stays in `Markdown` (raw HTML off).
   - **Existing tests:** `PrBriefCard.tsx` does not change in this wave, so its two call sites (`ReviewFocusList`, `RiskArea`) must still type-check. All new props are optional, and `navKeyPrefix` is optional with default `"risk"`. Until step 8, `ReviewFocusList` keeps the deprecated optional `onFocusFile` and calls it directly with the item's file/line, exactly as today, when `onNavigate` is absent. That keeps `PrBriefCard.test.tsx` green through wave 2. Step 8 removes the shim.
   - **Encoding:** `ReviewFocusList.tsx`/`RiskArea.tsx` are CRLF; preserve them.
   - implements: AC-5, AC-6, AC-7, AC-24, AC-26, AC-28, AC-29, AC-30, EC-1, EC-2, EC-14, NFR-2(a,c), NFR-4(a,b,c), NFR-5 — governed by: frontend-architecture (single-component hook in the component's folder; sub-component in `_components/<Name>/` with `index.ts`; `@devdigest/ui` barrel), react-best-practices (state lives in the hook, not duplicated per child; native buttons for a11y; derive the path set, no effect), security (exact-match only; external links only through the existing `githubBlobUrl` + `MonoLink`) — owner: implementer

6. [wave 2, after 2] Overview latest-review banner component: `.../OverviewTab/_components/LatestReviewBanner/{index.ts,LatestReviewBanner.tsx,styles.ts}` (new).
   - Props: `{ reviews: readonly ReviewRecord[]; runs?: readonly RunSummary[] }`.
   - `latest = selectLatestReview(reviews)`. `null` → `return null` (AC-18).
   - Otherwise render the existing `VerdictBanner` (imported from `../../../VerdictBanner`, the same route's `_components`; it stays in the `prReview` namespace per OQ-12) with:
     - `verdict`, `summary`, `score` (null → gauge omitted by the existing banner, AC-21);
     - `findingsCount = latest.findings.length`;
     - `blockers = countBlockers(latest.findings)`;
     - `agentName = latest.agent_name`.
   - When `isNewestRunFailed(runs)`, show an adjacent notice `t("banner.latestRunFailed")` from the `brief` namespace (AC-19, AC-22).
   - No fetching: the data comes in through props.
   - implements: AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, EC-12, EC-13, EC-15, EC-17 — governed by: frontend-architecture (sub-component nested under its single parent; components never fetch), react-best-practices (derive at render; early return for the empty state) — owner: implementer

7. [wave 3, after 4-6] `.../DiffTab/DiffTab.tsx`, `.../DiffTab/_components/RoleGroup/RoleGroup.tsx`, `.../DiffTab/DiffTab.test.tsx` (fixture-only edit).
   - **`DiffTab`:** new optional prop `focusRequest?: DiffFocusTarget | null`.
     - Build a `DiffFocusApi` with `target = focusRequest ?? null`, `noDiffLabel = tBrief("navigation.noDiff")`, `targetMarkerLabel = tBrief("navigation.targetMarker")` (`useTranslations("brief")`).
     - `claim` is backed by a `useRef<Set<number>>` that returns `true` only the first time per nonce for this `DiffTab` mount (R7).
     - Pass `focus` to `DiffViewer` and to each `RoleGroup`.
     - Changing `focusRequest` must not reset `showComments`, `order`, `hiddenIds`, or other cards' state. No `key` on anything derived from the request (AC-9).
   - **`RoleGroup`:** new optional prop `focus?: DiffFocusApi`. When a new target nonce arrives whose `path` is in `group.files`, use the "adjust state when a prop changes" pattern (last-seen nonce in state) to `setOpen(true)` and set `overrides` for that path to `true` (EC-4, EC-16).
   - **`DiffTab.test.tsx`:** fixture-only change. Add the `brief` namespace (`messages/en/brief.json`) to its `NextIntlClientProvider` messages so the new `useTranslations("brief")` doesn't log `MISSING_MESSAGE`. No assertion changes.
   - **Encoding:** `RoleGroup.tsx` is CRLF; `DiffTab.tsx` is LF. Preserve both.
   - implements: AC-2, AC-9, AC-10, AC-11 (claim-once), EC-4, EC-8, EC-16, NFR-3 — governed by: frontend-architecture (route component supplies data to shared chrome through an API object), react-best-practices (no effect for prop→state; the ref registry is not render state) — owner: implementer

8. [wave 3, after 1, 5] `.../PrBriefCard/PrBriefCard.tsx`, `.../PrBriefCard/_components/GeneratingSkeleton/{index.ts,GeneratingSkeleton.tsx,styles.ts}` (new), `.../PrBriefCard/PrBriefCard.test.tsx` (minimal maintenance edit, listed below).
   - **Props:** `PrBriefCard` gets a new optional prop `files?: readonly PrFile[]`. It calls `useBriefNavigation(files, onFocusFile)` and passes `onNavigate` (only when `canNavigate`) plus `notInDiffKey` to `ReviewFocusList` and to each `RiskArea` (`navKeyPrefix={\`risk:${i}\`}`). Remove the step-5 `onFocusFile` shim from `ReviewFocusList`.
   - **While `generating`** (`generate.isPending || page.status === "generating"`):
     - replace the badge column, what/why, refresh button and empty-state text with `<GeneratingSkeleton />`. That component renders its Skeleton bars inside an `aria-hidden="true"` wrapper, plus a `<span role="status" aria-live="polite">{t("status.generating")}</span>`;
     - hide the details toggle and the details;
     - suppress the footer's own generating status line so there is a single live region;
     - keep the section title, the footer Generate button (loading) and `RunReviewDropdown` visible (AC-12, AC-15, NFR-2f).
   - **On mutation error** (`generate.isError && !generating`):
     - the previous brief (still cached) or the empty state renders as usual;
     - the footer shows a status line `t("status.failed")` with the `failed` `STATUS_META` icon;
     - the toast uses `e instanceof ApiError && e.message ? e.message : t("generate.error")` (AC-14, AC-23).
   - **On success** the skeleton disappears as soon as `generating` is false and the new page is in the cache (AC-13; `useGenerateBrief.onSuccess` already writes the result to the cache).
   - Keep the initial-load skeleton branch as it is.
   - **Size:** keep the component under ~200 lines by extracting only the skeleton and keeping status-text derivation in `helpers.ts` if needed. `helpers.ts` is owned by step 2 in wave 1 and is free in wave 3, so this step may add a pure `footerStatusText` there.
   - **`PrBriefCard.test.tsx`, maintenance only, no new cases:**
     - the case at line 163 ("real host link"): a risk ref is now a button when `files` + `onFocusFile` are passed. Keep the case by rendering without `onFocusFile`, which keeps the link fallback;
     - the case at line 176 ("calls onFocusFile"): pass `files` containing `src/middleware/ratelimit.ts`;
     - update the `useGenerateBrief` mock to include `isError: false`.
   - **Encoding:** `PrBriefCard.tsx` is LF; `PrBriefCard.test.tsx` is CRLF. Preserve both.
   - implements: AC-5, AC-7, AC-12, AC-13, AC-14, AC-15, AC-22, AC-23, AC-28, EC-11, NFR-2(c,f) — governed by: frontend-architecture (sub-component folder; strings from the catalogue), react-best-practices (mutually exclusive UI states as early returns/branches; derive `generating`/`failed` at render) — owner: implementer

9. [wave 4, after 6-8] `.../OverviewTab/OverviewTab.tsx` and `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`.
   - **`OverviewTab`:** new props `files: PrFile[]`, `reviews: ReviewRecord[]`, `prRuns?: RunSummary[]`.
     - Render `<LatestReviewBanner reviews={reviews} runs={prRuns} />` first, above the brief section (AC-16).
     - Pass `files` to `PrBriefCard`.
     - Update the `onFocusFile` doc comment to describe the new behaviour.
   - **`page.tsx`** (stay thin, orchestration only):
     - `const focusNonce = React.useRef(0)` and `const [focusRequest, setFocusRequest] = React.useState<DiffFocusTarget | null>(null)`;
     - `onFocusFile={(file, line) => { setFocusRequest({ path: file, line, nonce: ++focusNonce.current }); setTab("diff"); }}`;
     - `setTab` clears `focusRequest` whenever the new tab is not `"diff"`. It is the one handler used by `PrDetailHeader.onSetTab`, `onRunStart` and `onFocusFile`, so returning to Files changed never re-applies a navigation. The request is not in the URL, so a reload doesn't re-apply it (AC-11, EC-18);
     - pass `files={pr.files}`, `reviews={runs}`, `prRuns={prRuns}` to `OverviewTab`, and `focusRequest={focusRequest}` to `DiffTab`;
     - import `DiffFocusTarget` as a type from `@/components/diff-viewer`;
     - no new hooks or fetches (NFR-5).
   - **Encoding:** both files are CRLF and contain UTF-8; preserve both.
   - implements: AC-1, AC-11, AC-16, AC-20, AC-28, EC-15, EC-18, NFR-5 — governed by: frontend-architecture (thin page: state wiring only, logic lives in components/helpers), react-best-practices (event logic in the handler, not an effect), next-best-practices (route stays a `"use client"` page by design per `client/INSIGHTS.md` 2026-09-19; no new route handlers) — owner: implementer

10. [wave 5, after 4, 7] Diff focus integration tests:
    - `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` (new), rendering `FileCard` / `DiffViewer` directly with a `DiffFocusApi` fixture;
    - extend `.../DiffTab/DiffTab.test.tsx`.

    Cases, sourced from the spec's Verify hints:
    - AC-2: a file above `AUTO_EXPAND_MAX_LINES` (200), with the target in a hunk → card expanded, the stubbed `scrollIntoView` was called on the line element, which has `aria-current="location"` and the marker label;
    - AC-2 / EC-16: in `DiffTab` smart order, the target in the collapsed `docs` group → group and card expanded;
    - AC-3: `line: null` → header scrolled and focused, no `aria-current` line;
    - AC-4: line outside every hunk → the nearest hunk row scrolled, no highlight;
    - AC-8 / EC-3: `patch: null` → header focused and a `role="status"` with the catalogue `navigation.noDiff` text;
    - AC-9: toggle "Show comments", then rerender with a new `focusRequest` → scroll happened and comments are still shown;
    - AC-10: same path/line with a new nonce → second scroll, exactly one `aria-current="location"`;
    - AC-11 (DiffTab level): rerender with the same nonce, or remount after the claim → no new scroll;
    - AC-25: `document.activeElement` is the target;
    - AC-27: stubbed `matchMedia` reduce → `scrollIntoView` called with `behavior: "auto"`, otherwise `"smooth"`;
    - NFR-3: run EC-1..EC-6 and EC-16 fixtures with a `console.error` spy and assert 0 calls and no thrown render.

    Test setup:
    - stub `Element.prototype.scrollIntoView` and `window.matchMedia` per test and restore them;
    - mock hooks via `@/lib/hooks/...`;
    - use `fireEvent`, not `user-event`;
    - provide the `shell`, `prReview` and `brief` namespaces.

    implements: AC-2, AC-3, AC-4, AC-8, AC-9, AC-10, AC-11, AC-25, AC-27, EC-3, EC-4, EC-5, EC-6, EC-7, EC-8, EC-16, NFR-2(b,d,e), NFR-3 — governed by: react-testing-library (with the repo override: `fireEvent`), frontend-architecture (colocated tests) — owner: test-writer

11. [wave 5, after 5, 8] Brief integration tests: extend `.../PrBriefCard/PrBriefCard.test.tsx`, and add `.../PrBriefCard/_components/NotInDiffNotice/NotInDiffNotice.test.tsx` (small).

    Cases:
    - AC-5: risk refs `a.ts:12` and `b.ts`, both in `files` → `onFocusFile("a.ts", 12)` and `("b.ts", null)`;
    - AC-6: risk header clicked twice → `aria-expanded` flips, the explanation appears then disappears, `onFocusFile` not called;
    - AC-7 / EC-1: focus item `x/y.ts` not in `files` → the text "File not in this PR's diff" inside that `<li>`, `onFocusFile` not called, other items still navigate, no error;
    - OQ-9: an out-of-diff risk ref shows the notice plus an external link with `rel="noopener noreferrer"`;
    - AC-12 (a): no brief + pending mutation → skeleton (`aria-hidden`) present, empty-state text absent, title and Run Review present;
    - AC-12 (b): existing brief + pending → old what/why absent;
    - AC-15: within the card, `role="status"` with `aria-live="polite"` contains `status.generating`;
    - AC-13: rerender from pending to a new generated page → skeleton gone, new what/why shown;
    - AC-14 / EC-11: mutation error with and without an `ApiError` → skeleton gone, the previous body or empty state, the `status.failed` line, `toast.error` called;
    - AC-23: plain `Error` → the toast receives the catalogue sentinel;
    - AC-22 / AC-24: render the whole block with a `brief` catalogue whose values are replaced by sentinels, then assert no default English remains (punctuation excluded, R5) and the notice text equals the catalogue value;
    - AC-26: every focus item, risk ref and risk header is a native `<button type="button">` without a negative tabIndex, and is operable by click (jsdom limit, R8);
    - AC-28 / EC-14: an `earlier_state` brief citing a file still in `files` navigates, and a removed file shows the notice;
    - AC-29 (UI): a hostile path `javascript:alert(1)` renders no `<a>` with that href and shows the notice;
    - AC-30 / NFR-4b: what, why, title, explanation, reason and file strings containing `<img src=x onerror=…>` / `<script>` → no `img`/`script` element in the DOM;
    - NFR-5: spy on `globalThis.fetch` during navigation clicks → 0 calls.

    Test setup: scope `role="status"` queries with `within(section)`, because `ToastProvider` also owns one.

    implements: AC-5, AC-6, AC-7, AC-12, AC-13, AC-14, AC-15, AC-22, AC-23, AC-24, AC-26, AC-28, AC-29, AC-30, EC-1, EC-2, EC-9, EC-11, EC-14, NFR-2(a,c,f), NFR-4, NFR-5 — governed by: react-testing-library (repo override: `fireEvent`), frontend-architecture — owner: test-writer

12. [wave 5, after 6, 9] Overview / banner tests:
    - `.../OverviewTab/_components/LatestReviewBanner/LatestReviewBanner.test.tsx` (new);
    - `.../OverviewTab/OverviewTab.test.tsx` (new; mock `PrBriefCard`'s hooks via `@/lib/hooks/brief`, plus `IntentCard`/`BlastRadiusCard` hooks via their `@/lib/hooks/...` aliases);
    - extend `.../VerdictBanner/VerdictBanner.test.tsx`.

    Cases:
    - AC-16: one completed review → the banner precedes the brief card in DOM order and shows that review's verdict, score and agent;
    - AC-18 / EC-12: empty reviews → no banner, brief card and grid render, "Review not run yet" present;
    - AC-19 / EC-17: newest run failed plus an older completed review → banner of the older review plus the `banner.latestRunFailed` notice;
    - AC-20 / EC-15: rerender with reviews `[A]` then `[B (newer), A]` → banner shows B;
    - AC-21: `VerdictBanner` with `score: null` → verdict label present, no "PR SCORE" / score element.

    implements: AC-16, AC-18, AC-19, AC-20, AC-21, EC-12, EC-15, EC-17 — governed by: react-testing-library (repo override: `fireEvent`), frontend-architecture — owner: test-writer

13. [wave 5, after 9] PR page integration test: `client/src/app/repos/[repoId]/pulls/[number]/page.test.tsx` (new, colocated with the route).
    - **Mocks:**
      - `next/navigation`: `useParams`; `useSearchParams` reads a module-level `URLSearchParams`; `router.replace` updates it and triggers a rerender;
      - `@/lib/hooks`, `@/lib/hooks/reviews`, `@/lib/hooks/brief`, `@/lib/hooks/smart-diff` and `@/lib/repo-context` via the alias, returning fixtures;
      - `AppShell` may be stubbed as a boundary (it pulls nav/repo chrome), but must render its children.
    - **Cases:**
      - AC-1: a brief focus item citing file F, which is present in `pr.files` → after a click the Files changed content is rendered and F's card is in the DOM;
      - AC-7: an absent file → the tab stays `overview` and the notice is shown;
      - AC-11: navigate via a focus item, switch to Overview through the header tab, then back to Files changed → no new `scrollIntoView` call and no `aria-current` line;
      - AC-28: an `earlier_state` brief runs end-to-end through the page;
      - NFR-5: spy on `fetch` → 0 calls across the navigation.
    - Provide the `brief`, `prReview`, `shell` and other needed namespaces.
    - implements: AC-1, AC-7, AC-11, AC-28, EC-18, NFR-5 — governed by: react-testing-library (repo override: `fireEvent`), frontend-architecture (route-level test colocated; no e2e here), next-best-practices (mocking `next/navigation` client hooks) — owner: test-writer

### File ownership (per wave)
| Wave | Step | Files owned |
|---|---|---|
| 0 | 0 | none (orchestrator records review results in its run notes) |
| 1 | 1 | `client/messages/en/brief.json` |
| 1 | 2 | `client/src/components/diff-viewer/focus.ts` (new); `.../PrBriefCard/helpers.ts`; `.../OverviewTab/helpers.ts` (new) |
| 1 | 3 | `client/src/components/diff-viewer/focus.test.ts` (new); `.../PrBriefCard/helpers.test.ts` (new); `.../OverviewTab/helpers.test.ts` (new) |
| 2 | 4 | `client/src/components/diff-viewer/FileCard/FileCard.tsx`; `.../CodeLine/CodeLine.tsx`; `.../DiffViewer/DiffViewer.tsx`; `client/src/components/diff-viewer/styles.ts`; `client/src/components/diff-viewer/index.ts` |
| 2 | 5 | `.../PrBriefCard/useBriefNavigation.ts` (new); `.../PrBriefCard/ReviewFocusList.tsx`; `.../PrBriefCard/RiskArea.tsx`; `.../PrBriefCard/_components/NotInDiffNotice/*` (new); `.../PrBriefCard/styles.ts` |
| 2 | 6 | `.../OverviewTab/_components/LatestReviewBanner/*` (new) |
| 3 | 7 | `.../DiffTab/DiffTab.tsx`; `.../DiffTab/_components/RoleGroup/RoleGroup.tsx`; `.../DiffTab/DiffTab.test.tsx` (fixture-only) |
| 3 | 8 | `.../PrBriefCard/PrBriefCard.tsx`; `.../PrBriefCard/_components/GeneratingSkeleton/*` (new); `.../PrBriefCard/helpers.ts` (optional `footerStatusText` only); `.../PrBriefCard/PrBriefCard.test.tsx` (maintenance-only); `.../PrBriefCard/ReviewFocusList.tsx` (shim removal only) |
| 4 | 9 | `.../OverviewTab/OverviewTab.tsx`; `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` |
| 5 | 10 | `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` (new); `.../DiffTab/DiffTab.test.tsx` |
| 5 | 11 | `.../PrBriefCard/PrBriefCard.test.tsx`; `.../PrBriefCard/_components/NotInDiffNotice/NotInDiffNotice.test.tsx` (new) |
| 5 | 12 | `.../OverviewTab/_components/LatestReviewBanner/LatestReviewBanner.test.tsx` (new); `.../OverviewTab/OverviewTab.test.tsx` (new); `.../VerdictBanner/VerdictBanner.test.tsx` |
| 5 | 13 | `client/src/app/repos/[repoId]/pulls/[number]/page.test.tsx` (new) |

`...` = `client/src/app/repos/[repoId]/pulls/[number]/_components`. No file appears twice within a wave. `ReviewFocusList.tsx` is owned by step 5 (wave 2) and step 8 (wave 3), which are different waves. `PrBriefCard/helpers.ts` is owned by step 2 (wave 1) and step 8 (wave 3). No step touches `src/vendor/**`, `src/lib/hooks/**`, `server/**`, or any Project Context / Onboarding Tour file.

### Spec coverage
| ID | Priority | Step(s) | Test owner |
|---|---|---|---|
| AC-1 | MUST | 9 | test-writer step 13 |
| AC-2 | MUST | 4, 7 | test-writer step 10 |
| AC-3 | MUST | 2, 4 | test-writer steps 3, 10 |
| AC-4 | MUST | 2, 4 | test-writer steps 3 (unit), 10 (integration) |
| AC-5 | MUST | 5, 8 | test-writer step 11 |
| AC-6 | MUST | 5 | test-writer step 11 |
| AC-7 | MUST | 5, 8, 9 | test-writer steps 11, 13 |
| AC-8 | SHOULD | 4, 7 | test-writer step 10 |
| AC-9 | MUST | 7 | test-writer step 10 |
| AC-10 | SHOULD | 4, 7, 9 | test-writer step 10 |
| AC-11 | MUST | 7 (claim-once), 9 (clear on tab change) | test-writer steps 10, 13 |
| AC-12 | MUST | 8 | test-writer step 11 |
| AC-13 | MUST | 8 | test-writer step 11 |
| AC-14 | MUST | 1, 8 | test-writer step 11 |
| AC-15 | MUST | 1, 8 | test-writer step 11 |
| AC-16 | MUST | 6, 9 | test-writer step 12 |
| AC-17 | MUST | 2, 6 | test-writer step 3 |
| AC-18 | MUST | 2, 6 | test-writer steps 3, 12 |
| AC-19 | SHOULD | 2, 6 | test-writer steps 3, 12 |
| AC-20 | MUST | 6, 9 | test-writer step 12 |
| AC-21 | MUST | 6 (existing banner behaviour) | test-writer step 12 |
| AC-22 | MUST | 1, 5, 6, 8 | test-writer step 11 |
| AC-23 | MUST | 1, 8 | test-writer step 11 |
| AC-24 | MUST | 1, 5, 7 | test-writer steps 10, 11 |
| AC-25 | MUST | 4 | test-writer step 10 |
| AC-26 | MUST | 5 | test-writer step 11 (structural) + manual (NFR-2) |
| AC-27 | MUST | 2, 4 | test-writer steps 3, 10 |
| AC-28 | MUST | 5, 8, 9 | test-writer steps 11, 13 |
| AC-29 | MUST | 2, 5 | test-writer steps 3, 11 |
| AC-30 | MUST | 5 (existing Markdown / JSX text, no raw HTML) | test-writer step 11 |
| EC-1 | — | 5 | test-writer step 11 |
| EC-2 | — | 2, 5 | test-writer steps 3, 11 |
| EC-3 | — | 4 | test-writer step 10 |
| EC-4 | — | 4, 7 | test-writer step 10 |
| EC-5 | — | 4 | test-writer step 10 |
| EC-6 | — | 2, 4 | test-writer steps 3, 10 |
| EC-7 | — | 4, 7 | test-writer step 10 |
| EC-8 | — | 7 | test-writer step 10 |
| EC-9 | — | 4, 5 | test-writer steps 10, 11 + manual |
| EC-10 | — | 2, 4 | test-writer steps 3, 10 |
| EC-11 | — | 8 | test-writer step 11 |
| EC-12 | — | 6 | test-writer step 12 |
| EC-13 | — | 2 | test-writer step 3 |
| EC-14 | — | 5, 8 | test-writer step 11 |
| EC-15 | — | 6, 9 | test-writer step 12 |
| EC-16 | — | 7 | test-writer step 10 |
| EC-17 | — | 2, 6 | test-writer steps 3, 12 |
| EC-18 | — | 9 | test-writer step 13 |
| NFR-1 | SHOULD | 4, 9 (by design: synchronous lookup, no network) | manual (desktop browser timing; no e2e step in client-only scope, R6) |
| NFR-2 | MUST | 4, 5, 8 | test-writer steps 10, 11 + manual keyboard/screen-reader pass |
| NFR-3 | MUST | 4, 7 | test-writer step 10 |
| NFR-4 | MUST | 2, 5 | test-writer steps 3, 11 |
| NFR-5 | MUST | 5, 9 | test-writer steps 11, 13 |

Every MUST row has an implementing step and a test owner.

### Skills the implementer will invoke
From `.claude/skills/pr-self-review/SKILL.md` Phase 4 (loaded at plan time, not copied):
- **Non-test `client/src/**` `.ts`/`.tsx`** (steps 2, 4, 5, 6, 7, 8, 9): `frontend-architecture`, `react-best-practices`, `next-best-practices`.
  - In practice `next-best-practices` matters only for `page.tsx` (step 9).
- **Client tests** (`*.test.ts(x)`; steps 3, 10-13, plus the fixture-only edits in 7 and 8): `react-testing-library`, plus `frontend-architecture` for placement.
  - Repo override: `fireEvent`, not `user-event`.
- **Every changed `.ts`/`.tsx`:** `typescript-expert` and `security`.
  - `security` matters most for steps 2, 4 and 5 (untrusted paths, no DOM selectors from paths, no HTML rendering).
- **`client/messages/**`** (step 1): i18n key-parity check (no skill exists). Only the `en` locale exists today.
- **Not applicable:** no `vendor/shared`, `zod` or server rows apply.

### Verification scope
- **After each wave:** run `bash scripts/verify-changed.sh` from the repo root. It runs client typecheck and `vitest related` for the diff. arch:check and vendor-sync do not apply here.
  - **Caveat:** that script diffs against `main`, so it also covers the uncommitted Project Context / Onboarding Tour files. Record a baseline run before wave 1. Any failure in files this plan does not own is pre-existing and must be reported, not fixed.
- **Expected red:** the wave 1 test-first files (step 3) are expected to be red only until step 2 lands within the same wave.
- **Line endings and encoding,** after every implementer step:
  - `git diff --stat` on the owned files (no whole-file churn);
  - `file <path>` (line endings unchanged);
  - `LC_ALL=C grep -c $'\x97' <path>` = 0 for files with non-ASCII text.
- **Once at the end:** run `bash scripts/verify-changed.sh --full`. This runs the full `client` unit suite (the only package touched). No server, reviewer-core or e2e runs.
- **Manual, once at the end:** the NFR-2 keyboard and screen-reader checklist and the NFR-1 timing on a ~100-file PR in the running app (`./scripts/dev.sh`).

### Explicitly out of scope
- **Architecture-reviewer:**
  - whether `OverviewTab`'s prop count (now ~11) should instead read `usePrReviews` / `usePrRuns` itself (same query keys, no extra request);
  - whether the focus-request state belongs in `page.tsx` or a colocated hook;
  - whether `DiffFocusApi` in `src/components/diff-viewer` is the right shared surface.
- **Security-reviewer:** confirming that no brief string reaches an `href`/route except through `githubBlobUrl` after an exact-match failure (OQ-9), and that no DOM lookup interpolates a path.
- Server, model, caching, contracts (OQ-2, OQ-10), e2e flows, other hard-coded PR-page strings (OQ-12), and the OQ-13 UX ideas.
- Writing `INSIGHTS.md`: the orchestrator does this once at the end via `engineering-insights`.

### Open questions / assumptions
Each was adopted without an interview (`AskUserQuestion` unavailable) and can be vetoed:
- **A1 (OQ-1):** the not-in-diff message is inline next to the activated item, with no tab switch. One message is shown at a time (`notInDiffKey`). It clears on the next successful navigation, or when details are hidden (unmount).
- **A2 (OQ-3):** the highlight is derived from the active request. It lasts until the next navigation or until the user leaves Files changed (the page clears the request).
- **A3 (OQ-4):** a line outside any hunk scrolls to the nearest hunk header with no highlight. Ties go to the earlier hunk. Non-finite lines go to the first hunk.
- **A4 (OQ-5, OQ-6, OQ-8):** one banner for the newest `review`-kind review with a verdict across agents; no banner when there is none; Overview only. The Findings-tab accordion banners are unchanged.
- **A5 (OQ-7):** "newest run" = the greatest non-null `RunSummary.ran_at`; failed = `status === "failed"`. The notice shows only when a banner is shown.
- **A6 (OQ-9):** out-of-diff risk refs show the notice plus a secondary external link (existing `githubBlobUrl` + `MonoLink`) when repo and head sha are known. Review-focus items show the notice only.
- **A7 (OQ-11, OQ-12):** the AC-8 wording is "No diff available for this file."; the banner keeps the `prReview` namespace; only the brief block and the failed-run notice use `brief.json`.
- **A8 (R1):** AC-20 relies on the existing `["reviews", prId]` refetch paths. No new polling is added.
- **A9 (R5):** punctuation separators (` — `, `:`) are not "user-visible English" for AC-22.
- **A10:** in-app navigation turns on only when both `files` and `onFocusFile` are supplied to `PrBriefCard`. Otherwise today's external-link fallback stays (this keeps other call sites and tests working).
- **A11:** `DiffTab` reads the `brief` namespace for the two diff-side labels, so the shared diff-viewer stays namespace-agnostic.
- **A12:** if any implementer finds that a server or vendored-contract change is unavoidable, stop and report it as a spec conflict (non-goal). No such need was found during planning.
