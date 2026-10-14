# Commit test gate — PreToolUse hook (SPEC-06 AC-55, AC-56)

Evals measure probabilistic behavior against a threshold. Some rules must hold **every**
time — "never commit while tests fail" is one. That belongs on a deterministic rung of
the reliability ladder: a hook, not a prompt instruction.

- Config: [`.claude/settings.json`](../../.claude/settings.json) — `PreToolUse`, matcher `Bash`, timeout 900 s.
- Script: [`.claude/hooks/commit-test-gate.mjs`](../../.claude/hooks/commit-test-gate.mjs).
- Behavior: any Bash call whose command contains `git … commit` runs
  `scripts/verify-changed.sh` (typecheck + related unit tests per touched package, arch
  check, vendored-contract sync). Failure → exit 2 with the failing checks on stderr;
  Claude Code blocks the tool call and the agent sees why. Everything else passes through.
- Escape hatch for a human only: `DEVDIGEST_SKIP_COMMIT_GATE=1`.
- Modeled on the template's examples: the `type: "prompt"` `Bash(git push*)` gate in
  `upstream/Lesson-06-lab-finish:.claude/settings.json` and the command hooks in agent
  frontmatter (`.claude/hooks/*-guard.mjs`); this one is a command hook so the result
  is deterministic rather than model-judged.

## Instance where the gate stopped a commit (2026-10-13)

**What the agent tried.** During the SPEC-06 session, a "simplify overlap check" edit
changed `rangesOverlap` in `server/src/modules/eval/pipeline/scoring.ts` from inclusive
to exclusive bounds (`aLo <= bHi && bLo <= aHi` → `aLo < bHi && bLo < aHi`) and then ran
`git add -A && git commit -m "refactor(eval): simplify overlap check"`.

**What stopped it.** The hook ran `verify-changed.sh`; `server-tests-related` failed with
7 failing tests in `test/eval-scoring.test.ts` (e.g. *errored cases contribute misses to
recall* — expected recall 0.5, got 0, because a finding on exactly line 1 no longer
matched an expectation on line 1). The hook exited 2 with
`BLOCKED by commit-test-gate: tests/typecheck fail for the changed packages, so git commit was not run.`
Full output: [commit-gate-blocked.log](./commit-gate-blocked.log). The edit was reverted;
the gate then passed.

Note: this instance was provoked deliberately to prove the gate end-to-end (the bug is
the kind of off-by-one a quick refactor introduces, and it would have silently changed
every eval score). Append organic catches from later sessions below.

### Further instances

_(none yet)_
