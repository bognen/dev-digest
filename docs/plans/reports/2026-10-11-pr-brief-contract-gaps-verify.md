## Plan verification: PR Brief contract gaps (SPEC-04)

### Inputs
Mode final. Plan docs/plans/2026-10-11-pr-brief-contract-gaps-plan.md; spec specs/2026-10-11-pr-brief-contract-gaps.md. Diff: working tree vs HEAD (0e9d586) plus untracked files. Baseline excluded: SPEC-05 files, INSIGHTS.md. Evidence re-run by me: 5 server unit files (29 passed), brief.it.test.ts (11 passed, 0 skipped, Docker), client PrBriefCard/BriefBody/hooks-brief (8 files, 90 passed), check-vendor-shared-sync.sh (in sync). The caller's fresh --full gate was trusted, not re-run.

### Plan items
| Step | Status | Evidence |
|---|---|---|
| 1 contract + sync test | DONE | brief-contract.test.ts (3 tests: byte-identity, shape, legacy parse) pass; sync script OK |
| 2 characterization tests | DONE | brief-grounding.test.ts:9,31,51; brief-prompt.test.ts:44,56,83,89 |
| 3 brief.json keys | DONE | client/messages/en/brief.json:72-80 (additive) |
| 4 server brief module | DONE | constants.ts MAX_SUMMARY_SENTENCES=3; schemas.ts summary; grounding.ts summary + fallback; prompts.ts system prompt + budget/overBudget; facts.ts deriveMissingInputs; service.ts warn, missing_inputs, one call |
| 5 routes | DONE (deviation OK) | routes.ts registers both paths with the same schema/handler body via a for-loop; z.preprocess(v ?? {}) for absent body. IT test proves both paths and the shared guard. Deviation judged acceptable: behaviour equals the plan, and the loop keeps Zod-provider typing. |
| 6 client hook | DONE (deviation OK) | hooks/brief.ts:41 posts `/pulls/${prId}/brief`; test is .tsx (brief.test.tsx:17, passes). Extension only. |
| 7 card body | DONE | BriefBody.tsx, index.ts, PrBriefCard.tsx:26,157, styles.ts:41,48; summary replaces what/why (A1) |
| 8 server unit tests | DONE | brief-{grounding,prompt,facts,service}.test.ts, all pass |
| 9 integration | DONE | brief.it.test.ts 11 passed / 0 skipped |
| 10 client tests | DONE | BriefBody.test.tsx (5), PrBriefCard.summary.test.tsx (4) pass; existing PrBriefCard.test/states tests green |

### Spec criteria
| ID | Status | Evidence |
|---|---|---|
| AC-1 | DONE | grounding.ts summary clamp 3 + fallback; unit grounding.test.ts:79; IT "AC-1" (brief.it.test.ts:232) store + re-read |
| AC-2 | DONE | grounding.test.ts:68 (link replaced, citation dropped) |
| AC-3 | DONE | brief-contract.test.ts:22; IT :253 (GET and both POSTs, legacy row) |
| AC-4 | DONE | PrBriefCard.summary.test.tsx:92 (summary precedes Risk areas) |
| AC-5 | DONE | PrBriefCard.summary.test.tsx:104; BriefBody.test.tsx:37 |
| AC-6 | DONE | brief-contract.test.ts:12; sync script |
| AC-7 | DONE | IT :276 ({} / regenerate / no body / cross-workspace 404); hooks/brief.test.tsx:17 |
| AC-8 | DONE | IT :312, :339 (both orders, one model call, `generating`) |
| AC-9 | DONE | grounding.test.ts:9 |
| AC-10 | DONE | grounding.test.ts:31 (already met in code, test only) |
| AC-11 | DONE | grounding.test.ts:51 |
| AC-12 | DONE | facts.ts deriveMissingInputs; facts.test.ts:11; service.test.ts:220; IT :366 (response and re-read); card tests BriefBody.test.tsx:53,69, summary.test.tsx:119 |
| AC-13 | DONE | facts.test.ts:21; service.test.ts:228; IT :379 (real [] with intent/issue/spec/index); card tests :85 and summary.test.tsx:119 |
| AC-14 | DONE | service.test.ts:167; IT :410 |
| AC-15 | DONE | service.test.ts:141 (one call, attempts 2, fields, no prose); IT :460 |
| AC-16 | DONE | service.test.ts:180; IT :429 |
| AC-17 | DONE | brief-prompt.test.ts:44 |
| AC-18 | DONE | brief-prompt.test.ts:56,83 |
| AC-19 | DONE | prompts.ts overBudget; service.ts warn `brief.input_over_budget` {prId,provider,model,tokens,budget}; prompt.test.ts:107; service.test.ts:243 (model still called once, prose-free), :255 |
| EC-1..EC-9 | DONE | covered by the rows above (EC-1 AC-3/5, EC-2 grounding:79, EC-3/7 IT :312/:339, EC-4 :31, EC-5 :9, EC-6 prompt:107 + service:243, EC-8 facts:11/IT :366, EC-9 service:141) |
| NFR-1 | DONE | BRIEF_INPUT_TOKEN_BUDGET unchanged at 8000; prompt.test.ts:56 |
| NFR-2 | DONE | IT :253/:312; no migration (jsonb) |
| NFR-3 (SHOULD) | DONE for model-call failures | service.test.ts:261; IT :460. A8 (ConfigError before the model call writes no brief.generate line) is untested by design. I judge it acceptable: the SHOULD is scoped to model-call failures in plan A8, but note it is a literal gap vs "every generation attempt". Status CANNOT VERIFY for that sub-case. |
| NFR-4a | DONE | prompt.test.ts:89; IT :379 |
| NFR-4b | DONE | BriefBody.test.tsx:93; summary.test.tsx:142 |
| NFR-4c | DONE | IT :276 (404 on both paths; alias covered in :312/:276) |

Known deviations judged: for-loop route registration (OK); hook test .tsx (OK); A8 untested (acceptable, noted above); AC-10 already met (confirmed, test-only).

Extra beyond plan, harmless: `missingInputs` (enum names only) added to the brief.generate log line (allowed by A10).

### Changes outside plan scope
None attributable to SPEC-04 beyond plan mapping. server/test/helpers/brief-fixtures.ts is a shared fixture for steps 2/8/9 (new, unlisted in the plan's ownership table but supports it). Remaining modified/untracked client files (OverviewTab/*, IntentCard/*, PrBriefCard.layout.test.tsx, ReviewFocusCard.tsx, RiskAreasSection.tsx, RiskArea.tsx, page.test.tsx, PrBriefCard.states/test.tsx edits, styles.ts SPEC-05 parts) were treated as SPEC-05 baseline per the caller and not checked against it. Note: PrBriefCard.test.tsx and PrBriefCard.states.test.tsx show as modified, but the plan required no edits from SPEC-04. I could not separate whether those edits are SPEC-05 only; they pass.

### Verification-scope commands
- Server unit (5 files): 29 passed.
- brief.it.test.ts: 11 passed, 0 skipped.
- Client PrBriefCard/BriefBody/hooks-brief: 8 files, 90 passed.
- check-vendor-shared-sync.sh: in sync.
- Full gate (verify-changed.sh --full): caller reports all PASS; not re-run.

### Result
COMPLETE for SPEC-04 (every AC/EC/NFR row DONE; NFR-3 ConfigError sub-case CANNOT VERIFY by documented design A8).
Gaps for a fix pass: none required. Optional: confirm PrBriefCard.test.tsx / PrBriefCard.states.test.tsx edits belong to SPEC-05, since the plan said SPEC-04 leaves them untouched.
