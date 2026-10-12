# specs/

Specs that affect **multiple modules** (e.g. server + client + mcp-server). A spec
that touches a single module lives in that module's own folder instead:

| Scope | Location |
|---|---|
| Several modules | `specs/YYYY-MM-DD-kebab-name.md` (this folder) |
| `server/`, `client/`, `reviewer-core/`, `mcp-server/` | `<pkg>/specs/YYYY-MM-DD-kebab-name.md` |
| `e2e/` | `e2e/design-specs/YYYY-MM-DD-kebab-name.md` (`e2e/specs/` is executable flow JSON) |

Specs are written by the [`spec-creator`](../.claude/agents/spec-creator.md) agent
(Spec-Driven Development). Each carries a `SPEC-NN` ID, unique across all spec
folders, and a `Status` (`draft` → `approved` → `implemented`) that only a human changes.

Development Plans live in [`docs/plans/`](../docs/plans/) as `<same-stem>-plan.md`, written by
[`implementation-planner`](../.claude/agents/implementation-planner.md)
(`Status: draft` → human sets `approved`) and executed by the
[`orchestrator`](../.claude/agents/orchestrator.md).

## Index

- [06-mcp-server.md](./06-mcp-server.md) · [06-mcp-server-plan.md](./06-mcp-server-plan.md)
- [07-blast-radius.md](./07-blast-radius.md)
- [2026-10-10-project-context.md](./2026-10-10-project-context.md) · SPEC-01 · draft
- [2026-10-10-onboarding-tour.md](./2026-10-10-onboarding-tour.md) · SPEC-02 · draft
