# Development Plan: PR Brief Overview layout (SPEC-05)
Spec: client/specs/2026-10-11-pr-brief-overview-layout.md
Status: approved

## Development Plan: PR Brief Overview layout (SPEC-05)

### Requirements review
- **Source:** `client/specs/2026-10-11-pr-brief-overview-layout.md` (SPEC-05, `Status: approved`). It supersedes only SPEC-03's "Show details" disclosure; every other SPEC-03 (`client/specs/2026-10-11-pr-brief-polish.md`) and SPEC-04 (`specs/2026-10-11-pr-brief-contract-gaps.md`) criterion stays in force. Neither spec is edited.
- **Clarifications (from the caller, who relayed the user's decisions):** all open questions take the spec's recommended defaults.
  - OQ-1: the brief panel stays directly under the banner.
  - OQ-2: no cost line or refresh icon on the banner.
  - OQ-3: no cap on the number of items.
  - OQ-4: remove the `details.show` / `details.hide` keys.
  - OQ-5: long paths wrap, with no ellipsis.
  - OQ-6: only expanded risk refs navigate. The collapsed first ref is plain text.
  - OQ-7: the stacking breakpoint is 768 px.
  - OQ-8: the supersession scope is confirmed. The not-in-diff notice clears on the next successful navigation, which is what `useBriefNavigation` already does.
- **Starting point:** SPEC-03 and SPEC-04 are implemented in the working tree but not committed. This plan builds on that code (the `BriefBody` summary, `useBriefNavigation`, the banner and the footer) and does not redo it.
- **Recommended improvements (non-blocking; for the spec owner to act on, not acted on here):**
  1. AC-11 and AC-15 conflict on wording. AC-11 renders the card "with at least one item" and AC-15 renders it with zero items. The plan always renders the card while a brief is displayed: a badge when there are items, the empty text when there are none. Recommend merging the two ACs. *Accepted in the plan's interpretation.*
  2. AC-6 does not say whether the Intent label row appears when intent hard-fails (`isError`). The plan renders a Risk-areas-only card with no Intent label. *Assumed.*
  3. OQ-9 ideas are not adopted: a risk count badge, severity ordering, and a "back to brief" control. *Declined (not in scope).*
- **Execution mode:** single-agent pass, as the caller instructed. This planner ran as a subagent, so doubts are listed as assumptions rather than asked.

### Scope
This plan is client-only. It changes three things on the PR detail Overview tab:
1. It removes the "Show details" toggle, so Risk areas and Review focus show by default.
2. It moves the single "PR Brief" section label up to the Overview. The label then sits above the latest-review banner, the brief panel, a two-column grid and a full-width Review focus card. The grid holds Intent with Risk areas at its bottom on the left, and Blast radius on the right.
3. Every collapsed risk row shows its first file ref as mono text, and long text wraps.

The grid stacks below 768 px. The plan also updates the brief catalogue and the existing SPEC-03/04 tests that clicked the toggle, and adds new SPEC-05 tests.

It does **not** touch:
- the server, the brief contract, or the vendored `@devdigest/shared` (client or server copy);
- `page.tsx`, `useBriefNavigation`, the `lib/hooks/brief.ts` hooks, `LatestReviewBanner` or `BlastRadiusCard` content;
- the Files changed or Agent runs tabs;
- the banner cost line or refresh icon (OQ-2);
- the hard-coded "Description" label in `OverviewTab`. It is pre-existing and not in this spec.

### Modules affected
- **client/** only, under `src/app/repos/[repoId]/pulls/[number]/_components/{PrBriefCard,OverviewTab}`, plus `messages/en/brief.json` and the existing tests that depend on the toggle (including `pulls/[number]/page.test.tsx`).
- server, reviewer-core, e2e and mcp-server are not touched.

### Architectural constraints
- **frontend-architecture (`.claude/skills/frontend-architecture/SKILL.md`):**
  - Components never fetch. Data stays in `lib/hooks/brief.ts`, and this plan adds no hook calls beyond the existing single `useBrief` / `useGenerateBrief` in `PrBriefCard` (NFR-1).
  - Styles are inline objects in the folder's `styles.ts`, with `var(--…)` tokens and no hex values. There are no CSS modules and no Tailwind classes in app code.
  - Strings live in `messages/en/brief.json`.
  - Constants go in `constants.ts`.
  - The per-component `index.ts` is a forwarder only.
  - UI comes from the `@devdigest/ui` barrel only.
  - Siblings in one route's `_components` must not reach into each other's internals. `OverviewTab` imports only `../PrBriefCard` (the forwarder), which is why this plan uses a render-prop and does not import `RiskArea` or `ReviewFocusList` from `OverviewTab`.
- **client/AGENTS.md:**
  - Import UI only through the `@devdigest/ui` barrel.
  - Component tests mock fetch and hooks and never touch the API.
  - `src/vendor/**` is do-not-touch. This plan needs no vendor/ui change: `SectionLabel`, `Badge` and `Icon` already exist.
- **client/INSIGHTS.md:**
  - *2026-10-11 "PR Brief navigation":* brief paths are untrusted. They are matched only by exact `Set.has` (`resolveBriefTarget`), and the external link is offered only when `isSafeRepoPath` passes. Keep this unchanged (NFR-3). The collapsed first ref is text only and never an `href`.
  - *2026-10-11 "Testing scroll/focus and brief states in jsdom":* use catalogue-sentinel tests for "no hard-coded label" (AC-23). A `vitest run` path containing `[brackets]` finds no files, so filter by test name (`-t`).
  - *2026-09-30:* `@testing-library/user-event` is **not installed**. Use `fireEvent`, even though the react-testing-library skill prefers `userEvent`. Adding the dependency is out of scope.
  - *2026-10-10:* native `<button>` keyDown does not become a click in jsdom. Assert Tab reachability and Enter/Space operability structurally: native `type="button"` plus `focus()`. Real key activation is checked manually.
  - *2026-10-05 / 2026-09-20 (encoding / line endings):* after editing any file that contains non-ASCII text (`brief.json` contains `—` and `…`), check `LC_ALL=C grep -c $'\x97' <file>` returns 0, and check `git diff --stat` for whole-file EOL churn.
- **react-best-practices:**
  - Derive at render: `riskAreas` and `reviewFocus` are computed from `page` and `generating`, not stored in state.
  - No `useEffect` for layout.
  - `{items.length > 0 && …}`, never `{items.length && …}`, so a `0` is never rendered as text (AC-15).
- **next-best-practices (hydration):** the viewport hook must use `useSyncExternalStore` with a server snapshot of `false` (the wide layout). That keeps SSR and the first client render identical, so there is no hydration mismatch.
- No server constraints apply: no server file is touched, so `onion-architecture` and `pnpm arch:check` are not in play.

### Steps

Line endings: every existing file listed below is **LF** (checked 2026-10-11 with `grep $'\r'`). Create every new file as **LF**. No step introduces non-ASCII characters.

1. **[wave 1] Brief panel parts and the catalogue.**
   - **Files:** `client/messages/en/brief.json`, `PrBriefCard/PrBriefCard.tsx`, `PrBriefCard/RiskArea.tsx`, `PrBriefCard/ReviewFocusList.tsx`, `PrBriefCard/styles.ts`, plus two new files `PrBriefCard/RiskAreasSection.tsx` and `PrBriefCard/ReviewFocusCard.tsx`. They are loose files next to `RiskArea.tsx`, matching this folder's existing pattern. All `PrBriefCard/` paths are under `client/src/app/repos/[repoId]/pulls/[number]/_components/`.
   - **What changes:**
     - (a) `brief.json`: delete the whole `details` object (OQ-4). Change the value of `section.focus` to `"Review focus - read these first"`, with an ASCII hyphen as the spec wording uses. Do not add any other keys.
     - (b) `PrBriefCard.tsx`:
       - Remove the `showDetails` state, the footer details toggle and the `SectionLabel` (the label moves to OverviewTab in step 3).
       - Add an optional render prop `children?: (parts: { panel: React.ReactNode; riskAreas: React.ReactNode | null; reviewFocus: React.ReactNode | null }) => React.ReactNode`.
       - Every branch (loading, generating, brief, empty) builds `panel` (the existing `s.panel` div with skeleton/body/refresh/footer) and returns `children ? children(parts) : <>{panel}{riskAreas}{reviewFocus}</>`, from **one single return site**. A different wrapper per branch would remount IntentCard and BlastRadiusCard inside the caller's tree whenever the brief status changes.
       - `riskAreas` and `reviewFocus` are non-null only when `hasBrief && brief && !generating`. That covers AC-3, AC-16, AC-17, AC-19 and AC-20; failed, earlier_state and possibly_stale states with a brief still show them.
       - `riskAreas` = `<RiskAreasSection>` and `reviewFocus` = `<ReviewFocusCard>`. Both get the same `onNavigate` / `notInDiffKey` from the single `useBriefNavigation` instance, so only one notice shows across risks and focus (OQ-8).
       - Leave the footer (status/provenance line, "Review not run yet", Generate button, Run Review, refresh) unchanged (AC-21).
       - Update the header comment.
     - (c) `RiskAreasSection.tsx`:
       - Renders `<section aria-labelledby={id}>` with `id = React.useId()`, a label element with that id showing `t("section.risks")`, then either the `RiskArea` list or `<p>{t("section.noRisks")}</p>`.
       - Gets a top separator (border-top) for its in-card placement (AC-5, AC-9, AC-24).
     - (d) `ReviewFocusCard.tsx`:
       - A full-width bordered card: `<section aria-labelledby={id}>`, with a header `SectionLabel` whose children are `<span id={id}>{t("section.focus")}</span>`.
       - `right` = a `Badge` with `data-testid="review-focus-count"` showing `items.length`, rendered only when `items.length > 0`.
       - Then `ReviewFocusList`, which keeps its existing empty text `focus.empty`, row format, navigation and notice.
       - Covers AC-11, AC-12, AC-13, AC-14, AC-15, AC-24 and NFR-2c.
     - (e) `RiskArea.tsx`:
       - While `!expanded` and `risk.file_refs[0]` exists, render that ref inside the header button as `<span className="mono" style={s.riskRef}>` plain text, with no link and no button.
       - While expanded, render it only in the existing ref list, so it is never duplicated (AC-7, EC-7, OQ-6, NFR-3).
       - Expanded behavior is unchanged (AC-8).
     - (f) `ReviewFocusList.tsx`: only make the label and reason wrap (EC-8). Change no logic.
     - (g) `styles.ts`:
       - Delete `detailsToggle` and `details`.
       - `riskTitle`: drop `nowrap` / `ellipsis` and use `overflowWrap: "anywhere"` (OQ-5).
       - `riskHeader`: allow wrapping.
       - Add `riskRef` (mono, 12px, muted, `overflowWrap: "anywhere"`), `riskSection`, `focusCard` (same border/radius/background tokens as `panel`, `marginBottom: 24`), and `overflowWrap: "anywhere"` on `focusButton` / `focusReason`.
     - (h) Mechanical updates to existing tests, so this wave stays green. **Owner: implementer, deletions and label relocation only, no new assertions.** The replacement assertions belong to test-writer steps 4-7.
       - In `PrBriefCard/PrBriefCard.test.tsx`, `PrBriefCard/PrBriefCard.states.test.tsx` and `PrBriefCard/PrBriefCard.summary.test.tsx`, plus `OverviewTab/OverviewTab.test.tsx` (line 252) and `pulls/[number]/page.test.tsx` (`showDetails` helper at line 241 and its 4 calls): delete the `expandDetails` / `showDetails` helpers and every call.
       - `PrBriefCard.test.tsx`: delete the line asserting "collapsed by default" (`queryByText("New unauthenticated endpoint")…not`, around line 123), the `show details … aria-expanded false` line (line 155), and `getByText("PR Brief")` in the loading test (line 298). Replace `getByText("Review focus")` (line 144) with the catalogue value of `section.focus`.
       - `PrBriefCard.states.test.tsx`: remove `"section.title"` and `"details.show"` from the sentinel key list (lines 211-214) and remove the `@@details.hide@@` assertion (line 222).
       - `PrBriefCard.summary.test.tsx`: delete the `messages.details.show` click (line 95).
       - If any other assertion then fails only because a header now contains the first ref text, scope it with `getByRole("button", { name })` or `within`. Do not delete it.
   - **Implements:** AC-3, AC-4, AC-5 (section part), AC-7, AC-8, AC-9, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-23, AC-24, NFR-1, NFR-2, NFR-3.
   - **Governed by:**
     - `frontend-architecture`: no fetch in components, styles in `styles.ts`, catalogue strings, UI through the barrel.
     - `react-best-practices`: derive the parts at render, one return site (component identity), and `length > 0` guards.
     - `react-testing-library`: the mechanical test edits.
     - `security`: brief text stays plain text or Markdown with HTML disabled, and the collapsed ref is never an href.
     - `typescript-expert`: the render-prop parts type is inferred at the call site, so do not add a type export to the `index.ts` forwarder.
   - **Owner:** implementer.

2. **[wave 1] IntentCard risk slot.**
   - **Files:** `OverviewTab/_components/IntentCard/IntentCard.tsx`, `OverviewTab/_components/IntentCard/styles.ts`.
   - **What changes:**
     - Add an optional prop `riskAreas?: React.ReactNode`.
     - When an intent record exists, render it **inside** `s.card` as the last child, after the scope columns, ticket refs, captions and footer row, separated by `s.riskDivider` (border-top + padding) (AC-5).
     - In each no-intent branch, render it **below** the existing content as `<div style={s.riskCard}>{riskAreas}</div>`, a card of its own with the same border/background tokens as `card(false)`. The no-intent branches are loading, `provider_not_configured`, `generation_failed` and `not_generated`.
     - In the `isError || !data` branch, which returns `null` today: return `<section style={s.root}><div style={s.riskCard}>{riskAreas}</div></section>` when `riskAreas` is non-null, and `null` otherwise. That keeps current behavior when nothing is passed (AC-6, EC-1).
     - No other content changes.
     - Existing `IntentCard.test.tsx` cases pass unchanged because the prop is optional.
   - **Implements:** AC-5, AC-6.
   - **Governed by:** `frontend-architecture` (composition through a slot prop instead of IntentCard importing brief code, styles in `styles.ts`); `react-best-practices` (composition over configuration, keep the early-return state branches).
   - **Owner:** implementer.

3. **[wave 2, after 1-2] Overview arrangement and responsive stacking.**
   - **Files:** `OverviewTab/OverviewTab.tsx`, `OverviewTab/styles.ts`, plus new files `OverviewTab/constants.ts`, `OverviewTab/useStackedLayout.ts` and `OverviewTab/useStackedLayout.test.ts`.
   - **`OverviewTab.tsx` changes:**
     - Add `useTranslations("brief")`.
     - Render in this order:
       1. `<SectionLabel icon="FileText">{t("section.title")}</SectionLabel>`, the only "PR Brief" label (AC-1).
       2. `<LatestReviewBanner …/>`, unchanged.
       3. `<PrBriefCard …same props…>{({ panel, riskAreas, reviewFocus }) => (<>…</>)}</PrBriefCard>`, whose render prop returns:
          - `<div style={s.briefSection}>{panel}</div>`;
          - the grid `<div style={stacked ? s.overviewGridStacked : s.overviewGrid}>`, holding cell 1 `<IntentCard prId={prId} riskAreas={riskAreas} />` and cell 2 `<BlastRadiusCard …/>`, unchanged (AC-10);
          - `{reviewFocus}`.
       4. The existing Description section, still after everything else.
     - This gives AC-2's DOM order: banner, panel, grid, Review focus. When no review exists, the banner is absent and the rest keeps its order (EC-11).
   - **`constants.ts`:** `export const OVERVIEW_STACK_QUERY = "(max-width: 767.98px)";` (OQ-7).
   - **`useStackedLayout.ts`:**
     - `useSyncExternalStore`, subscribing to `window.matchMedia(OVERVIEW_STACK_QUERY)` `change` events, with an unsubscribe in cleanup.
     - Client snapshot `matches`; server snapshot `false`.
     - Returns `false` when `window.matchMedia` is missing, as in jsdom (AC-22).
   - **`styles.ts`:** add `overviewGridStacked` (`gridTemplateColumns: "minmax(0, 1fr)"`, same gap and margin).
   - **`useStackedLayout.test.ts`:** a trivial hook test that is part of this step. It covers: no `matchMedia` gives `false`; a mocked `matches: true` gives `true`; a `change` event re-renders.
   - **Implements:** AC-1, AC-2, AC-10, AC-22, EC-11, NFR-1.
   - **Governed by:**
     - `frontend-architecture`: OverviewTab imports only the `../PrBriefCard` forwarder; the single-consumer hook is colocated in the component folder; the media query lives in `constants.ts`.
     - `react-best-practices`: the effect-free external-store subscription has cleanup.
     - `next-best-practices`: the server snapshot keeps hydration safe.
   - **Owner:** implementer. The hook test is inline because it is trivial.

4. **[wave 3, after 3] OverviewTab layout integration tests.**
   - **File:** new `OverviewTab/OverviewTab.layout.test.tsx`.
   - **Harness:** reuse `OverviewTab.test.tsx`'s mocking style (`vi.mock("@/lib/hooks/brief" | "@/lib/hooks/intent" | "@/lib/hooks/reviews" | "@/lib/hooks/blast-radius")`, `RunReviewDropdown` stub, `useToast` spy, all four message namespaces). Use `fireEvent`, not `userEvent`.
   - **Cases**, written from the ACs rather than from the implementation:
     - AC-1: exactly one `section.title` element, and it precedes the banner region, the panel, the grid and Review focus.
     - AC-2 and EC-11: DOM order with a review and without one.
     - AC-3: 2 risks and 2 focus items are visible with no click.
     - AC-4: no "Show details" / "Hide details" control.
     - AC-5: the Risk areas region is inside the Intent card after the scope columns, using an intent fixture with a record.
     - AC-6: with intent `isError`, `not_generated`, `provider_not_configured`, `generation_failed` and loading, the Risk areas region is still in the left grid cell.
     - AC-10: Blast radius is the sibling cell.
     - AC-11 and AC-12: 4 items, badge "4", rows after the grid, `src/config.ts:12` + reason and `src/x.ts` + reason for a null line.
     - AC-13: an in-diff click calls `onFocusFile(file, line)`.
     - AC-14: an absent file shows the notice beside the row, and `onFocusFile` is not called.
     - AC-15: no `review-focus-count` and the empty text.
     - AC-16: `status:none`, so no regions, while Intent and Blast stay.
     - AC-17: pending mutation over an existing brief shows the skeleton and no old titles or reasons.
     - AC-18: rerender with a new page shows the new titles.
     - AC-19: `isError` mutation keeps the prior rows and the status line.
     - AC-20: `possibly_stale` keeps the regions and the stale text.
     - AC-21: the footer has the provenance or status line, "Review not run yet" at 0 runs and Run Review; refresh calls `mutate({ regenerate: true }, …)` once.
     - AC-23: sentinel catalogue across `brief`, so `section.title`, `section.risks`, `section.focus` and `section.noRisks` / `focus.empty` render as sentinels.
     - AC-24 and NFR-2a/b/d: both regions resolve via `getByRole("region", { name })`; risk toggles and focus rows are native `type="button"`, can take `focus()`, and the toggle carries `aria-expanded`.
     - AC-22, structural: with mocked `matchMedia` `matches: true`, the grid's inline `gridTemplateColumns` is a single track and DOM order is Intent, Blast, Focus.
     - NFR-1: `useBrief` is called with only `prId`, there are no extra brief hook calls, and a `fetch` spy is not called during render.
     - NFR-3: a hostile `<img onerror>` in a risk title and a focus reason, plus a `javascript:` path, produce no `img` element, no `javascript:` href and no navigation.
   - **Implements (tests):** AC-1 to AC-6, AC-10 to AC-24, NFR-1, NFR-2, NFR-3, EC-1 to EC-6, EC-9 to EC-11.
   - **Governed by:** `react-testing-library` (queries by role/text, `data-testid` only for the badge absence); `frontend-architecture` (colocated test).
   - **Owner:** test-writer.

5. **[wave 3, after 1] PrBriefCard card-level tests.**
   - **File:** new `PrBriefCard/PrBriefCard.layout.test.tsx`.
   - **Setup:** standalone `PrBriefCard`, with and without a `children` render prop.
   - **Cases:**
     - AC-7 and EC-7: a collapsed row contains the title and the first ref (`src/a.ts:12-18`-style), not the second ref, and the first ref is not a link or button.
     - EC-8: the long title and ref style has no `whiteSpace: nowrap` / `textOverflow: ellipsis`.
     - AC-8: expanding shows the explanation and both refs as buttons; clicking an in-diff ref calls `onFocusFile`, and the header ref is not duplicated.
     - AC-9: `risks: []` shows "No specific risks identified." under the Risk areas label.
     - AC-4: no toggle.
     - Render-prop contract:
       - `riskAreas` / `reviewFocus` are `null` while loading, generating and with no brief;
       - both are non-null for a generated, failed-with-brief or stale brief;
       - the parts **do not remount** a stateful child across a `generated` to `generating` to `generated` rerender. Assert this with a child holding local state, such as an expanded risk in a sibling-rendered stub, or a counter stub rendered in the children.
     - AC-23: sentinel test proving no `details.*` key is rendered and `section.focus` is the sentinel.
     - NFR-3: hostile title and ref in the collapsed header render as inert text.
   - **Implements (tests):** AC-4, AC-7, AC-8, AC-9, AC-16, AC-17, AC-19, AC-20, AC-23, NFR-3, EC-7, EC-8.
   - **Governed by:** `react-testing-library`.
   - **Owner:** test-writer.

6. **[wave 3, after 2] IntentCard slot tests.**
   - **File:** extend `OverviewTab/_components/IntentCard/IntentCard.test.tsx`.
   - **Cases:**
     - With a record: the passed `riskAreas` node is inside the same card element as the statement and follows the in-scope / out-of-scope columns (AC-5).
     - For each no-intent state (loading, `not_generated`, `provider_not_configured`, `generation_failed`, `isError`): the node renders in its own card (AC-6).
     - `isError` with no slot still renders nothing (regression).
   - **Implements (tests):** AC-5, AC-6, EC-1.
   - **Governed by:** `react-testing-library`.
   - **Owner:** test-writer.

7. **[wave 3, after 1-3] Page-level journey tests.**
   - **File:** extend `client/src/app/repos/[repoId]/pulls/[number]/page.test.tsx`.
   - **Cases:**
     - AC-3: with no click, the Risk areas and Review focus regions are on the Overview.
     - AC-8: expand a risk, click its in-diff ref, and Files changed becomes active with `scrollIntoView` called once.
     - AC-13: already covered by the existing focus-click test after step 1(h). Add an explicit assertion that no "Show details" click precedes it.
     - AC-2: the banner precedes the brief panel, which precedes the Review focus region, at page level.
   - **Implements (tests):** AC-2, AC-3, AC-8, AC-13, AC-14.
   - **Governed by:** `react-testing-library`.
   - **Owner:** test-writer.

### File ownership (per wave)
| Wave | Step | Files owned (client/…, `_c` = `src/app/repos/[repoId]/pulls/[number]/_components`) |
|---|---|---|
| 1 | 1 | `messages/en/brief.json`; `_c/PrBriefCard/PrBriefCard.tsx`; `_c/PrBriefCard/RiskArea.tsx`; `_c/PrBriefCard/ReviewFocusList.tsx`; `_c/PrBriefCard/styles.ts`; `_c/PrBriefCard/RiskAreasSection.tsx` (new); `_c/PrBriefCard/ReviewFocusCard.tsx` (new); `_c/PrBriefCard/PrBriefCard.test.tsx`; `_c/PrBriefCard/PrBriefCard.states.test.tsx`; `_c/PrBriefCard/PrBriefCard.summary.test.tsx`; `_c/OverviewTab/OverviewTab.test.tsx`; `src/app/repos/[repoId]/pulls/[number]/page.test.tsx` |
| 1 | 2 | `_c/OverviewTab/_components/IntentCard/IntentCard.tsx`; `_c/OverviewTab/_components/IntentCard/styles.ts` |
| 2 | 3 | `_c/OverviewTab/OverviewTab.tsx`; `_c/OverviewTab/styles.ts`; `_c/OverviewTab/constants.ts` (new); `_c/OverviewTab/useStackedLayout.ts` (new); `_c/OverviewTab/useStackedLayout.test.ts` (new) |
| 3 | 4 | `_c/OverviewTab/OverviewTab.layout.test.tsx` (new) |
| 3 | 5 | `_c/PrBriefCard/PrBriefCard.layout.test.tsx` (new) |
| 3 | 6 | `_c/OverviewTab/_components/IntentCard/IntentCard.test.tsx` |
| 3 | 7 | `src/app/repos/[repoId]/pulls/[number]/page.test.tsx` |

Every existing file in the table is LF and stays LF; new files are LF. Within wave 1, step 1's test edits must keep the default layout (no `children`), which still renders panel, Risk areas and Review focus. OverviewTab and page tests therefore pass against the old OverviewTab until step 3 lands.

### Spec coverage
| ID | Priority | Step(s) | Test owner |
|---|---|---|---|
| AC-1 | MUST | 3 | test-writer step 4 |
| AC-2 | MUST | 3 | test-writer steps 4, 7 |
| AC-3 | MUST | 1 | test-writer steps 4, 7 |
| AC-4 | MUST | 1 | test-writer steps 4, 5 |
| AC-5 | MUST | 1, 2, 3 | test-writer steps 4, 6 |
| AC-6 | MUST | 2, 3 | test-writer steps 4, 6 |
| AC-7 | MUST | 1 | test-writer step 5 |
| AC-8 | MUST | 1 (unchanged behavior kept) | test-writer steps 5, 7 |
| AC-9 | MUST | 1 | test-writer step 5 (+4 sentinel) |
| AC-10 | MUST | 3 | test-writer step 4 |
| AC-11 | MUST | 1, 3 | test-writer step 4 |
| AC-12 | MUST | 1 | test-writer step 4 |
| AC-13 | MUST | 1 (navigation unchanged) | test-writer steps 4, 7 |
| AC-14 | MUST | 1 (notice unchanged) | test-writer steps 4, 7 |
| AC-15 | MUST | 1 | test-writer step 4 |
| AC-16 | MUST | 1, 3 | test-writer steps 4, 5 |
| AC-17 | MUST | 1 | test-writer steps 4, 5 |
| AC-18 | MUST | 1 | test-writer step 4 |
| AC-19 | MUST | 1 | test-writer steps 4, 5 |
| AC-20 | MUST | 1 | test-writer steps 4, 5 |
| AC-21 | MUST | 1 (footer kept) | test-writer step 4 |
| AC-22 | SHOULD | 3 | implementer inline (hook test, step 3) + test-writer step 4 (structural) + manual resize check |
| AC-23 | MUST | 1, 3 | test-writer steps 4, 5 |
| AC-24 | MUST | 1 | test-writer step 4 + manual (real key activation) |
| NFR-1 | MUST | 1, 3 | test-writer step 4 |
| NFR-2 | MUST | 1 | test-writer step 4 + manual keyboard and screen-reader pass |
| NFR-3 | MUST | 1 | test-writer steps 4, 5 |
| EC-1 | — | 2 | test-writer steps 4, 6 |
| EC-2 | — | 1 | test-writer steps 4, 5 |
| EC-3 | — | 1, 3 | test-writer step 4 |
| EC-4 | — | 1 | test-writer steps 4, 5 |
| EC-5 | — | 1 | test-writer steps 4, 5 |
| EC-6 | — | 1 | test-writer steps 4, 5 |
| EC-7 | — | 1 | test-writer step 5 |
| EC-8 | — | 1 (wrap, OQ-5) | test-writer step 5 + manual visual check |
| EC-9 | — | 1 (null line; no cap, OQ-3) | test-writer step 4 |
| EC-10 | — | 1 | test-writer steps 4, 7 |
| EC-11 | — | 3 | test-writer step 4 |

Every MUST criterion has at least one implementing step.

### Skills the implementer will invoke
From `.claude/skills/pr-self-review/SKILL.md` Phase 4 (the routing table is not copied here):
- Steps 1, 2 and 3 (non-test `client/src/**/*.{ts,tsx}`): `frontend-architecture`, `react-best-practices`, `next-best-practices`, plus `typescript-expert` and `security` (any changed `.ts`/`.tsx`).
- Step 1(h), the step 3 hook test, and steps 4-7 (`client/**/*.test.{ts,tsx}`): `react-testing-library`, plus `frontend-architecture` for placement.
- `client/messages/en/brief.json`: no skill. Do the i18n key-parity check: only the `en` locale exists, so confirm no component still references `details.*`, using `grep -rn "details\.\(show\|hide\)" client/src`.

### Verification scope
- After each wave: `bash scripts/verify-changed.sh`, which runs the client typecheck plus `vitest related` for the changed client files.
  - The diff base is `main`, so the uncommitted SPEC-03/04 server changes also trigger server checks. A server failure is not this plan's responsibility; report it, don't fix it.
- To target client tests by name, use `cd client && pnpm exec vitest run -t "<name>"`. Paths with `[brackets]` match no files.
- Encoding: after step 1, run `LC_ALL=C grep -c $'\x97' client/messages/en/brief.json`; it must return 0. Then confirm `git diff --stat` shows no whole-file EOL churn.
- Once at the end: `bash scripts/verify-changed.sh --full`, which runs the client unit suite. The `src/app/repos` subtree takes about 3 minutes.
- Manual: resize below 768 px (AC-22, EC-8 wrapping, no horizontal scroll), and do a keyboard and screen-reader pass (AC-24, NFR-2).
- No server, reviewer-core, e2e or arch:check work. No vendor-sync, because `vendor/shared` is untouched by this plan.

### Explicitly out of scope
- Architecture review of the two judgment calls below, which belong to `architecture-reviewer`:
  - The render-prop (`children` as a function) on `PrBriefCard`, used so `OverviewTab` can place the risk and focus parts without importing `PrBriefCard` internals. The alternative is lifting `useBrief` / `useGenerateBrief` / `useBriefNavigation` into OverviewTab through a hook exported from the forwarder, or moving `PrBriefCard` under `OverviewTab/_components/`, since it has one consumer.
  - The `matchMedia` hook for the 768 px stack. The alternative is an `@media` rule in `src/app/globals.css`, given that inline styles cannot express media queries.
- Security review of brief-text rendering, for `security-reviewer`. This plan does not change the Markdown or HTML policy or path matching.
- The banner cost line and refresh icon (OQ-2), OQ-9 ideas, adding `@testing-library/user-event`, and localising the existing hard-coded "Description" label.
- INSIGHTS.md updates are written by the orchestrator, not by plan steps.

### Open questions / assumptions
1. **Heading copy:** "Review focus - read these first" uses an ASCII hyphen, as the spec writes it. The design may use an em dash, but the hyphen avoids the documented cp1252 0x97 encoding risk. `SectionLabel` uppercases it.
2. **Catalogue keys:** the heading reuses `section.focus`, with its value changed, instead of adding a new key. That way no key is orphaned and the SPEC-03 sentinel test keeps working.
3. **AC-11 / AC-15:** the Review focus card always renders while a brief is displayed and not generating. It shows the badge only when there are items, and the empty text when there are none.
4. **Collapsed first ref:** it shows only while the row is collapsed, so it is never duplicated with the expanded ref buttons. It is plain text (OQ-6).
5. **Hard intent failure (`isError`):** the left column shows a Risk-areas-only card with no Intent label row, so top-edge alignment with Blast radius may differ in that state.
6. **Region accessible names:** `aria-labelledby` points at the visible heading text, so no new catalogue strings are needed for region names.
7. **The "PR Brief" label:** it uses the existing `FileText` icon and sits outside any card, matching `SectionLabel` usage elsewhere.
8. **Existing-test edits** (step 1(h)) are owned by the implementer because they only delete obsolete toggle interactions and relocate the label assertion; every new or inverted assertion is a test-writer step. If the orchestrator prefers strict separation, step 1(h) can move to a test-writer step in wave 1. Wave 1's `verify-changed` would then be red until that step finishes.
9. **Wave 3 timing:** the SPEC-05 tests come after the code (wave 3), not test-first. They depend on the render-prop contract, the IntentCard slot and catalogue values, and test-first tests would leave every per-wave `verify-changed` red.
