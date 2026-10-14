# Harness eval — `frontend-architecture` skill (SPEC-06 US-11, AC-53, AC-54)

The L02 skill now has regression protection, the same mechanism as the lab's skills:
`evals/skills/frontend-architecture/` (`*.cases.ts`, `*.eval.ts`, `fixtures/RunHistoryCard.tsx`).
Run: `cd evals && pnpm vitest run skills/frontend-architecture` (Claude Code login backend; ~4 min).

| Case | Tier | Checks |
|---|---|---|
| single-route component placement | grounding `_components/RunBadge` + judge | private `_components/<Name>/`, `index.ts` forwarder, co-located `styles.ts`/`constants.ts` |
| review of `RunHistoryCard.tsx` fixture | grounding `@devdigest/ui`, `lib/hooks` + judge | fetch → `lib/hooks` + `lib/api.ts`; deep imports → barrel; hex → `var(--…)`; inline literals |
| second route needs a component | grounding `src/components/` + judge | no cross-route `_components` import; promote; import direction |
| `utils.ts` grab-bag | judge | domain-named modules, per-component `helpers.ts`, split by domain |

## Calibration (run 1 → run 2)

Run 1 passed all 4 cases but two practices failed while the answer was reasonable:
"flags the magic number 25 **and** the UI strings" (the review picked one kind of inline
literal) and "does not suggest an `export *` barrel" (never asked). Both were rewritten
to what the prompt actually invites — catching *an* inline literal; splitting helpers by
domain. Run 2: **13/13 practices**.

## Sensitivity: break → red → revert → green

Three rules in `SKILL.md` were inverted (single-route components go to
`src/components/`; cross-route `_components` imports are "preferred"; one `src/lib/utils.ts`
for everything). Result: **1 of 4 cases failed** — the review case dropped to 2/4
(it stopped routing fetching to `lib/hooks` and stopped flagging inline literals), and the
utils case lost the per-component `helpers.ts` practice ([log](./frontend-architecture-broken.log)).
After `git checkout` of `SKILL.md`: **4/4 green** ([log](./frontend-architecture-green.log)).

Finding: cases 1 and 3 still passed on the broken skill, because the skill's *Core
Principles* section restates colocation and the promotion ladder in prose that wasn't
broken. Those two cases are therefore weak detectors for the table rows alone — a
stronger variant would break both places, or add a case that only the table answers.
