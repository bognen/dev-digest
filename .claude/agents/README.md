# Agents (`.claude/agents/`)

Custom subagents for this repo, invoked via the `Agent`/`Task` tool. This file
is a map of the set — responsibilities, permissions, and artifact flow. For
the actual rules each agent follows, read its own `.md` file; this doc does
not duplicate them.

## At a glance

| Agent | Role | Tools | Model | Preloaded skills | Reads | Produces |
|---|---|---|---|---|---|---|
| [`researcher`](./researcher.md) | Investigate a specific question (internal repo or external web) and report findings | `Read, Grep, Glob, Bash, WebFetch, WebSearch, AskUserQuestion` | sonnet | none | a scoped question | a structured findings report (Conclusions / Evidence / References / Could not find) |
| [`planner`](./planner.md) | Turn a feature/fix request into a Development Plan before any code is written | `Read, Grep, Glob, Bash, AskUserQuestion` | opus | all 13 domain skills (see below) | the request, module `AGENTS.md`/`INSIGHTS.md`, `pr-self-review`'s Phase 4 routing table | a Development Plan (markdown, fixed headings); assigns test steps to `implementer` (trivial) or `test-writer` (non-trivial) |
| [`implementer`](./implementer.md) | Execute an approved Development Plan across `client/`/`server/`, self-verify mechanically | `Read, Write, Edit, Grep, Glob, Bash, Skill` | sonnet | all 13 domain skills (see below) | a Development Plan | code changes + an Implementation Report (files↔plan-step mapping, test evidence, deviations, flags for review) |
| [`test-writer`](./test-writer.md) | Write UI/backend tests for non-trivial cases (business logic, integration flows, permission rules), sourced from the plan, not the implementation | `Read, Write, Edit, Grep, Glob, Bash, Skill` | sonnet | `react-testing-library`, `frontend-architecture`, `onion-architecture`, `fastify-best-practices`, `typescript-expert`, `engineering-insights` | a Development Plan (or a standalone "add tests for X" request) | test files only + a Test report |
| [`architecture-reviewer`](./architecture-reviewer.md) | Read-only: check architectural boundaries (server onion/Fastify edge, reviewer-core purity, client placement/RSC) | `Read, Grep, Glob, Bash, ReportFindings` | opus | `onion-architecture`, `fastify-best-practices`, `frontend-architecture`, `next-best-practices` | a diff or path set | evidence-backed findings (`ReportFindings`, or a fixed-heading markdown fallback) — no verdict |
| [`plan-verifier`](./plan-verifier.md) | Read-only: verify a completed change against a Development Plan, closed-list only | `Read, Grep, Glob, Bash, AskUserQuestion` | sonnet | none | a Development Plan + the diff/Implementation Report | a Plan verification report (`DONE/PARTIAL/MISSING/CANNOT VERIFY` per item, `COMPLETE`/`INCOMPLETE`) |
| [`doc-writer`](./doc-writer.md) | Convert an implemented feature or a plan into documentation + diagrams, filed in the right `docs/`/`specs/` location | `Read, Write, Edit, Grep, Glob, Bash` | sonnet | `mermaid-diagram` | a Development Plan or an implemented feature | doc files under the owning package's `docs/`/`specs/` + a Documentation report |

**Preloaded skills (planner and implementer, identical set):** `onion-architecture`,
`fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`,
`zod`, `frontend-architecture`, `next-best-practices`, `react-best-practices`,
`react-testing-library`, `typescript-expert`, `security`,
`engineering-insights`, `mermaid-diagram`. The other four agents each preload
only what their narrower role needs (see their own rows above).
Deliberately excluded everywhere: `pr-self-review` — it's the manual-only
review gate (`disable-model-invocation: true`); none of the seven agents runs
its skill-conformance grading (see "Pipeline" below).

## Pipeline

```
request → planner → Development Plan
        → implementer (+ test-writer for non-trivial tests)
        → code + Implementation Report (+ Test report)
        → plan-verifier → architecture-reviewer
        → (security review, not yet built)
        → doc-writer → PR
```

- **`planner`** has no `Write`/`Edit` — it cannot touch code, only produce the
  plan as its returned message. Persisting it to a file (e.g. under
  `server/specs/` or `client/specs/`) is the caller's choice, not the agent's.
  It also decides, per step, whether a needed test is trivial enough for
  `implementer` to write inline or must be its own step owned by
  `test-writer` (business logic, integration flows, permission rules —
  same-session code+test authorship is a documented trust risk).
- **`implementer`** consumes the plan as given input (pasted or by path) and
  treats it as the scope boundary — it does not re-plan.
- **`test-writer`** sources non-trivial test cases from the plan's stated
  requirements/edge cases, not from reading the implementation it's testing.
  It never touches non-test source.
- **`plan-verifier`** checks `implementer`'s (and `test-writer`'s) work
  against the plan only — closed-list, three-state per item, never a general
  code-quality pass.
- **`architecture-reviewer`** is read-only and evidence-required (`file:line`
  citations, dedup, no verdict) across server, reviewer-core, and client
  boundaries. It formalizes and extends `pr-self-review`'s
  backend-architecture cluster without editing that skill.
- **`doc-writer`** runs after a feature is implemented, or to convert a plan
  into a spec doc. It never edits code, `AGENTS.md`/`INSIGHTS.md`, or the
  DB-synced `docs/agent-prompts`/`docs/agent-skills`.
- **Security review is still not built.** `/pr-self-review` remains the
  manual local gate; none of the seven agents above runs its phases 4-6
  skill-conformance verdict — a plan/implement/verify/review cycle today ends
  at `doc-writer`'s report, not at a merge-ready verdict.

## `researcher`

Read-only investigator with two modes (internal repo research via
`Read`/`Grep`/`Glob`/`Bash`; external research via `WebFetch`/`WebSearch`),
each with its own report format. No delegation, no writes, asks via
`AskUserQuestion` before researching an underspecified question rather than
guessing scope. Full rules: [`researcher.md`](./researcher.md).

## `planner`

Produces a Development Plan that names, per step, the file(s) it touches and
the skill(s) that govern them — so the plan can't propose something the
implementer's skills would later reject (e.g. business logic in a route
handler, a hand-edited migration, direct Drizzle access outside a
repository). Treats `pr-self-review`'s Phase 4 file→skill table as the live
source of truth for path routing rather than hardcoding a second copy of it.
Architectural/security judgment calls go into the plan's "Open questions"
section, not resolved inline. Full rules and the exact output schema:
[`planner.md`](./planner.md).

**Sources for its rules:**

| Rule | Source |
|---|---|
| Strict tool allowlist per role (no `Write`/`Edit` on a planning agent) | Claude Code docs, *sub-agents* (code.claude.com/docs/en/sub-agents) |
| `model: opus` — complex reasoning/planning gets the stronger tier | platform.claude.com, *choosing a model* |
| Description states *when* to invoke ("use proactively before...") | Claude Code docs, *sub-agents* |
| Output format spelled out explicitly (objective, format, task boundaries) | Anthropic Engineering, *How we built our multi-agent research system* |
| Plan is pre-briefed on the not-yet-invoked implementer's constraints | Anthropic Engineering, *multi-agent research system* (task-boundary guidance) |
| Architecture/security review kept separate from planning | Claude Code docs, *best practices* ("Explore → Plan → Implement → Commit"; adversarial review step) |
| Route by the existing `pr-self-review` table instead of a hardcoded copy | Repo-internal: `.claude/skills/pr-self-review/SKILL.md` Phase 4 + its documented `skills-lock.json`/disk drift incident |
| Preload skills via the `skills:` frontmatter field | Claude Code docs, *features overview* (Skill vs Subagent — subagents preload skills) |

## `implementer`

Executes a given plan, selecting skills by the files it's touching (Phase 4
table again), running only mechanical self-checks (typecheck, the relevant
unit-test lane per touched package, `arch:check`, vendor-sync) scoped to what
it changed, and appending any non-obvious gotcha to the touched module's
`INSIGHTS.md` before finishing. Stops and reports rather than silently
expanding scope if the plan turns out to be wrong or incomplete. Full rules
and the exact report schema: [`implementer.md`](./implementer.md).

**Sources for its rules:**

| Rule | Source |
|---|---|
| Full read/write/exec tool set, scoped to what the role needs (`Skill` included so it can select skills) | Claude Code docs, *sub-agents* |
| `model: sonnet` — everyday coding/agent execution tier | platform.claude.com, *choosing a model* |
| Description gates invocation on a plan already existing | Claude Code docs, *sub-agents* |
| Self-verification is mechanical (run existing tests/typecheck, show evidence) — never a full audit | Claude Code docs, *best practices* ("Give Claude a way to verify its work"; adversarial-review scope wording) |
| Skill-conformance grading (`pr-self-review` phases 4-6) excluded — reserved for a separate review agent in a fresh context | Claude Code docs, *best practices* (adversarial review step) |
| Skills selected via the existing file-routing table, not duplicated | Repo-internal: `.claude/skills/pr-self-review/SKILL.md` Phase 4 |
| Preload skills via `skills:`; skill content vs. subagent isolation are complementary, not competing | Claude Code docs, *features overview* (Skill vs Subagent) |
| Respect repo-wide do-not-touch lists (`server/clones/**`, applied migrations, vendored dirs) | Repo-internal: `server/AGENTS.md`, `client/AGENTS.md`, `e2e/AGENTS.md` |
| Append to `INSIGHTS.md` before finishing a coding task | Repo-internal: `engineering-insights` skill trigger ("MUST be invoked... immediately after completing an implementation/fix/feature") |

## `test-writer`

Writes tests for already-implemented code, leading on anything non-trivial
(business logic, integration flows, permission rules) by sourcing cases from
the Development Plan's stated requirements/edge cases rather than from
reading the implementation — the split `planner` now encodes when it writes
"owner: test-writer" on a step. Never touches non-test source or `e2e/`
flow JSON. Full rules and output schema: [`test-writer.md`](./test-writer.md).

**Sources for its rules:**

| Rule | Source |
|---|---|
| Full write/exec tools, scoped to test files only, `Skill` included | Claude Code docs, *sub-agents* |
| `model: sonnet` — code-authoring execution tier | platform.claude.com, *choosing a model* |
| Sources non-trivial cases from the plan, not the implementation it's testing | Anthropic, *Claude Explains* — "Write reliable unit tests quickly with Claude" (flags same-session code+test authorship as the trust-calibration risk case) |
| Tests behavior, mocks only at system boundaries, never the module under test | Anthropic, *Claude Explains* — unit testing guidance |
| Placement/naming per package (`*.it.test.ts`, flat `server/test/`, colocated `client/**/*.test.tsx`) | Repo-internal: `server/AGENTS.md`, `TESTING.md`, `client/INSIGHTS.md` |
| Excluded from grading architecture/plan completion — stays in its lane | Claude Code docs, *best practices* (adversarial review / scope separation) |
| Appends gotchas to `INSIGHTS.md` before finishing | Repo-internal: `engineering-insights` skill trigger |

## `architecture-reviewer`

Read-only. Checks boundary conformance — server onion layering and the
Fastify edge, reviewer-core purity, and client placement/import-direction
rules including the RSC boundary — and returns evidence-required findings.
Formalizes and extends `pr-self-review`'s backend-architecture cluster
without editing that skill; never produces an overall verdict. Full rules
and output schema: [`architecture-reviewer.md`](./architecture-reviewer.md).

**Sources for its rules:**

| Rule | Source |
|---|---|
| Read-only tool allowlist, no `Write`/`Edit` | Claude Code docs, *sub-agents* |
| `model: opus` — boundary-tracing judgment calls | platform.claude.com, *choosing a model* |
| Every finding needs a `file:line` citation; "if not certain, don't flag it" | Anthropic, code.claude.com/docs/en/code-review ("verification bar"); `anthropics/claude-code` code-review agent prompt |
| One finding per unique issue (dedup); pre-existing/baselined violations aren't findings | Anthropic, code.claude.com/docs/en/code-review; repo-internal `.dependency-cruiser-known-violations.json` ratchet (`server/AGENTS.md`) |
| Output via the `ReportFindings` tool (typed, most-severe-first) | This harness's `ReportFindings` tool |
| No overall PASS/WARN/BLOCKED verdict — stays with `/pr-self-review` | Claude Code docs, *best practices* (adversarial review in a fresh, separate context) |
| Severity vocabulary (`critical\|major\|minor`) referenced from `pr-self-review` Phase 6, not duplicated | Repo-internal: `.claude/skills/pr-self-review/SKILL.md` Phase 6 |

## `plan-verifier`

Read-only. Verifies a completed change against a given Development Plan and
nothing else — closed-list, three-state per item, never a substitute for
general code review. Full rules and output schema:
[`plan-verifier.md`](./plan-verifier.md).

**Sources for its rules:**

| Rule | Source |
|---|---|
| Read-only tool allowlist (mirrors `researcher`) | Claude Code docs, *sub-agents* |
| Three-way verdict per item (`DONE`/`PARTIAL`/`MISSING`/`CANNOT VERIFY`), never a forced binary | Anthropic Engineering, *Demystifying evals for AI agents* ("give the LLM a way out... return 'Unknown'") |
| Closed-list scope: only checks what the plan states, no code-quality/architecture/style commentary | Anthropic Engineering, *Demystifying evals for AI agents* ("two domain experts would independently reach the same pass/fail verdict"); Claude Code docs, *best practices* (adversarial review scope wording) |
| No plan supplied → ask or stop, never reconstruct the plan from the diff | Repo convention, mirrors `planner`'s own "ambiguous scope → ask" rule |
| No skills preloaded — avoids drifting into general advice | Repo-internal design choice, mirrors `researcher`'s empty preload |

## `doc-writer`

Converts an implemented feature or a Development Plan into documentation and
Mermaid diagrams, filed under the owning package's `docs/`/`specs/` (plus a
cross-link for cross-package features). Describes what exists; never
verifies, reviews, or edits code. Full rules and output schema:
[`doc-writer.md`](./doc-writer.md).

**No Anthropic source addresses documentation-agent design** (confirmed by a
dedicated research pass — searched anthropic.com/engineering, claude.com/blog,
and docs.claude.com with no hit). Its sourcing below is credible but
non-Anthropic, flagged as such:

**Sources for its rules:**

| Rule | Source |
|---|---|
| `Write`/`Edit` scoped to docs paths only, by hard rule (same "`tools:` can't enforce this structurally" pattern as `researcher`'s read-only `Bash`) | Repo-internal convention (`researcher.md`, `planner.md`) |
| `model: sonnet` — authoring/synthesis tier | platform.claude.com, *choosing a model* |
| Classify new content against the existing docs taxonomy before inventing a new location | Diátaxis (diataxis.fr) — **non-Anthropic** |
| Diagrams generated from the same source material as the prose, not drawn separately | Mermaid / diagrams-as-code practice — **non-Anthropic** |
| Docs stay in sync with code/plans via the same workflow (version control, PR review) | Write the Docs, "docs as code" — **non-Anthropic** |
| Never touches DB-synced `docs/agent-prompts`/`docs/agent-skills`, `AGENTS.md`, `INSIGHTS.md`, or source | Repo-internal: `docs/agent-prompts/AGENTS.md`, `server/INSIGHTS.md` |

## Adding a new agent

Update the table and pipeline diagram above, and add a per-agent section
(responsibilities + sources, if it encodes non-obvious rules) — don't just
drop a new `.md` file in silently.
