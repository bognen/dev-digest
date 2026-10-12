## Plan verification: PR Brief Overview layout (SPEC-05)

### Inputs
Mode final. Plan docs/plans/2026-10-11-pr-brief-overview-layout-plan.md; spec client/specs/2026-10-11-pr-brief-overview-layout.md. Diff: working tree vs main. SPEC-03/04 changes excluded as baseline. Evidence: source read (C = client/src/app/repos/[repoId]/pulls/[number]/_components), plus fresh gate logs .devdigest/cache/verify/client-tests.log (20:02, after the last source edit at 19:51): 74 files / 507 tests passed, client-typecheck.log empty (clean). No tests re-run by me (log is fresh for this diff). `grep -c 0x97 brief.json` = 0; `grep details.(show|hide) client/src` = no hits.

### Plan items
| Step | Status | Evidence |
|---|---|---|
| 1 (a) catalogue | DONE | brief.json: no `details` object; `section.focus` = "Review focus - read these first" |
| 1 (b) PrBriefCard | DONE | PrBriefCard.tsx: no showDetails/SectionLabel; `children` render prop; `finish()` is the single hand-off (early loading return also goes through finish); parts non-null only when `hasBrief && brief && !generating`; one useBriefNavigation instance; footer unchanged |
| 1 (c) RiskAreasSection | DONE | RiskAreasSection.tsx: section aria-labelledby useId, label, list or noRisks |
| 1 (d) ReviewFocusCard | DONE | ReviewFocusCard.tsx: section + SectionLabel id span, badge only if items.length>0 |
| 1 (e) RiskArea first ref | DONE | RiskArea.tsx: `!expanded && file_refs[0]` mono span, plain text |
| 1 (f)(g) wrap + styles | DONE | styles.ts diff (riskRef, riskSection, focusCard, details styles removed); test "EC-8 ... no nowrap/ellipsis" |
| 1 (h) mechanical test edits | DONE | helpers removed; no `details.*` refs remain; states/test files in diff |
| 2 IntentCard slot | DONE | IntentCard.tsx: RiskCard in each no-intent branch, `isError||!data` returns section+card only if riskAreas else null, riskDivider inside card after scope content |
| 3 OverviewTab + hook | DONE | OverviewTab.tsx: label, banner, PrBriefCard render prop (panel, grid, focus), Description last; useStackedLayout.ts (useSyncExternalStore, server snapshot false, no matchMedia -> false); constants.ts query 767.98px; styles.overviewGridStacked |
| 4 OverviewTab.layout.test | DONE | 12 tests, all passed in gate log |
| 5 PrBriefCard.layout.test | DONE | 11 tests incl. "no remount", passed |
| 6 IntentCard.test | DONE | +7 per diff (11 tests passing) |
| 7 page.test | DONE | describe "PR detail page: SPEC-05 Overview layout", 3 tests (AC-3/AC-13, AC-8, AC-2) |
| useStackedLayout.test | DONE | 2 tests passed |

### Stated edge cases / requirements (spec)
| ID | Status | Evidence |
|---|---|---|
| AC-1 | DONE | OverviewTab.tsx single SectionLabel; layout test "AC-1/AC-2/..." |
| AC-2 | DONE | OverviewTab.tsx render order; layout test + "AC-2 / EC-11"; page test "AC-2" |
| AC-3 | DONE | layout test case 1; page test "AC-3/AC-13" |
| AC-4 | DONE | no toggle in PrBriefCard.tsx; layout tests (OverviewTab case 1, PrBriefCard "AC-7/EC-7/AC-4") |
| AC-5 | DONE | IntentCard.tsx riskDivider; "AC-5" layout test; IntentCard.test |
| AC-6 | DONE | IntentCard.tsx RiskCard branches; "AC-6 / EC-1" test |
| AC-7 | DONE | RiskArea.tsx; PrBriefCard "AC-7/EC-7/AC-4" |
| AC-8 | DONE | PrBriefCard "AC-8"; page test "AC-8" |
| AC-9 | DONE | RiskAreasSection.tsx; PrBriefCard "AC-9/AC-23" |
| AC-10 | DONE | OverviewTab.tsx sibling cells; layout case 1 |
| AC-11 | DONE | ReviewFocusCard.tsx; layout case 1 (4 items, badge) |
| AC-12 | DONE | ReviewFocusList label; layout case 1 |
| AC-13 | DONE | "AC-13/AC-14/AC-15/AC-24" test; page "AC-3/AC-13" |
| AC-14 | DONE | same test (notice, no onFocusFile) |
| AC-15 | DONE | ReviewFocusCard conditional badge; same test |
| AC-16 | DONE | "AC-16" layout test; PrBriefCard render-prop AC-16 |
| AC-17 | DONE | "AC-17/18/19/20/21" test; PrBriefCard AC-17 |
| AC-18 | DONE | same combined test |
| AC-19 | DONE | same combined test; PrBriefCard "AC-19/AC-20" |
| AC-20 | DONE | same |
| AC-21 | DONE | footer unchanged; combined test + "0 runs" test, refresh regenerate |
| AC-22 (SHOULD) | DONE (structural) / manual-pending | useStackedLayout + hook test + "AC-22 (structural)"; real browser resize manual-pending |
| AC-23 | DONE | "AC-23" sentinel tests (OverviewTab, PrBriefCard); no literal strings in new components |
| AC-24 | DONE (structural) / manual-pending | native type=button, aria-labelledby regions, tested in "AC-13/14/15/24"; real Enter/Space manual-pending |
| NFR-1 | DONE | no new hooks/fetch; "NFR-1" test |
| NFR-2 | DONE (a,c,d automated; b structural) / manual-pending | screen-reader pass and visible-focus check manual |
| NFR-3 | DONE | "NFR-3" tests in both files; refs collapsed are text, not href |
| EC-1..EC-7, EC-9..EC-11 | DONE | covered by tests above (EC-1: AC-6 test; EC-11: "AC-2 / EC-11"; EC-9 null line in case 1) |
| EC-8 | PARTIAL / manual-pending | wrap styles + style test done; visual no-overflow check manual |

### Changes outside plan scope
None unexplained. Files in the plan: all listed under C/PrBriefCard, C/OverviewTab, brief.json, page.test.tsx. Unmapped but explained: client/specs/2026-10-11-pr-brief-overview-layout.md and docs/plans plan (spec/plan artifacts). PrBriefCard.summary.test.tsx is untracked SPEC-04 baseline.

### Deviations judged
- CRLF: working copies are CRLF for all touched files, including pre-existing ones; git (autocrlf) normalises to LF, `git diff --stat` shows small diffs (no whole-file churn). Plan said LF, but no repo effect. Acceptable.
- review-focus-count testid on wrapper span: Badge does not take the attribute; behaviour (absent at zero) tested. Acceptable.
- finish() helper with early loading return: both paths go through finish, and the main path is the single return for brief states; loading is a different tree state only before a page exists. No-remount test passes. Acceptable (minor deviation from "one return site").

### Observation (not in spec)
splitFileRef (PrBriefCard/helpers.ts:7-13) only parses a trailing `:N`. A range ref such as `path:12-18` is treated as the whole string `path:12-18`, does not match the PR file list, and shows the not-in-diff notice on click. Pre-existing SPEC-03 behavior; spec AC-7 mentions `src/a.ts:12-18`-style refs for display only.

### Verification-scope commands
Gate logs (fresh, after last source edit): client tests 74 files / 507 passed; client typecheck clean; encoding check 0; details.* grep none. `verify-changed.sh --full` all PASS per caller.

### Result
COMPLETE (all automated rows DONE, no unexplained out-of-scope changes). Manual-pending (not gaps): AC-22 real resize, AC-24 real Enter/Space, NFR-2 screen-reader/visible focus, EC-8 visual check.
Gaps for a fix pass: none.
