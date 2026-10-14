---
name: onion-architecture
description: "Onion Architecture rules for the backend in server/: dependency rule, ports & adapters, repository/DTO mapping, Container/Deps wiring, and the dependency-cruiser check (pnpm arch:check). Use when creating, moving, reviewing or refactoring code in server/src/modules, adapters, platform or db — new modules, routes, services, repositories, adapters — or when a change adds an import between those areas or a query outside a repository. Trigger terms: onion architecture, layers, ports and adapters, hexagonal, dependency rule, repository pattern, DI container, arch:check, boundary violation."
metadata:
  tags: architecture, onion, hexagonal, clean-architecture, fastify, drizzle, backend, dependency-cruiser
---

# Onion Architecture — `server/`

**One rule:** source-code dependencies point **inward only**. Inner rings never
import outer rings; outer rings implement interfaces the inner rings own.
"The database is not the center. It is external." (Palermo)

Applies to `server/` only. `reviewer-core/` is already a pure engine (no DB, no
GitHub, no fs; only an injected `LLMProvider`) — keep it that way. `client/` is
out of scope.

## Ring map (flat files per module — no domain/application/infrastructure subfolders)

| Ring | Files | May import | Must NOT import |
|---|---|---|---|
| **1. Domain model** | `helpers.ts` (pure), `status.ts`, `constants.ts`, domain types, `@devdigest/shared` enums/contracts, `reviewer-core` | ring 1 only | fastify, drizzle, `db/*`, `adapters/*`, `platform/container` |
| **2. Ports** | `vendor/shared/adapters.ts` (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, …), per-module `types.ts` (e.g. `repo-intel/types.ts`), repository interfaces | ring 1 | anything with I/O |
| **3. Application services** | `service.ts`, `run-executor.ts`, `findings.ts`, `diff-loader.ts`, `pipeline/*` | rings 1–2 | fastify, drizzle, `db/*`, concrete `adapters/*`, the whole `Container` |
| **4. Edge** | `routes.ts` (UI), `repository.ts` / `repository/*.repo.ts` (persistence), `adapters/**` (SDKs), `db/**`, `platform/container.ts` (composition root) | anything inward | other modules' internals; `adapters/**` must not import `modules/**` |

- The **only** files allowed to import `drizzle-orm` or `db/schema|rows`: repositories, `db/**`, `adapters/**`, the composition root.
- The **only** files that may import `fastify`: `routes.ts`, `modules/index.ts` (registry), `_shared/context.ts`, `app.ts`. Verify with `grep -rl "from 'fastify'" server/src` instead of trusting this list.
- **`platform/container.ts` is the sole composition root.** It may import everything; nothing else may import it except routes (to reach `app.container`) and `_shared/context.ts`.
- **A module's public surface** is `index.ts` + `types.ts`. Everything else is private (`no-cross-module`). Cross-module needs go through a port on the Container or `_shared/`.

## Request flow — the layers in one line

`routes.ts` (validate) → **one** `service` call → domain (`helpers.ts`, pure) → ports → adapters/repositories at the edge. Services are built once from the Container (composition root) and reach every external system (LLM, GitHub, git, DB) **through a port injected by the Container** — the inner rings depend on the interface, the edge supplies the implementation.

**A route never calls an adapter (or a repository, or drizzle) directly.** `routes.ts` may import its own module's service, `_shared/*` and `@devdigest/shared` schemas — not `adapters/**` (`routes-no-persistence`). If a handler needs GitHub/LLM/git data, the service gets it via its port; the route only translates HTTP ↔ service call.

## Before you write code (checklist)

1. Which ring does each new file belong to? Name it by the ring map (`routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `types.ts`).
2. Does a route handler do more than: validate (Zod schema) → **one** service call → return? Move the rest into the service.
3. Is there any `eq(...)`, `db.select`, `$inferSelect` outside a repository? Move it. Repositories return **domain/DTO-ready types via a mapper**, never `typeof t.x.$inferSelect`.
4. Does the service take `Container`? Give it an explicit `Deps` object of ports instead (see `rules/platform-di.md`).
5. New external SDK or system? Define a port first (`vendor/shared/adapters.ts` or module `types.ts`), then the adapter (an anti-corruption translator), then a fake for tests (the repo keeps adapter mocks in `adapters/mocks.ts` wired via `ContainerOverrides`; this is a convention, not a layering rule).
6. Does the adapter import from `modules/**`? Move the shared constant/type to a neutral place (`vendor/shared` or `adapters/`).
7. Are you parsing/validating inside a handler or service? Put the Zod schema on the route (`schema: { body, params }`) — validate once, at the boundary.
8. Do DTO field names (snake_case contract) leak into services? Services work with domain shapes; mappers translate at the edges.
9. Does the change need a transaction? The **service** owns the boundary; repositories accept an optional `tx` (`rules/drizzle.md`).
10. Run `cd server && pnpm arch:check` (and `pnpm typecheck`). New violations fail; do not add to the baseline.

## Reviewing existing code (review mode)

When asked to review/audit rather than write code, optimise for **recall on real violations and precision on everything else**: a violation hidden in a deep file or behind an indirect import is as costly as a noisy list. Do not eyeball the tree and stop at the first few hits — run the sweep below.

### The sweep

1. **Scan.** Run `node <this-skill-dir>/scripts/scan-layers.mjs <path-to-server/src>` (the script sits next to this file; add `--json` for machine output). It parses every `.ts` file, resolves relative imports (including re-exports and dynamic `import()`), assigns each file to a ring from its path, and prints **candidate** violations per rule plus a ring map. It covers: `inner-no-outer`, `inner-no-container`, `only-repository-touches-db`, `routes-no-persistence` (imports and `container.*` calls inside handlers), `adapters-no-modules`, `no-cross-module`, `platform-not-inward`, `no-circular`, fastify allow-list, ORM row types in repository signatures, `safeParse`/`parse` of request data, HTTP concepts in inner rings, `process.env` in inner rings, and handlers that make several service calls.
2. **Verify every candidate.** The scanner is a heuristic. Open each flagged file at the flagged line, confirm it is a real breach, and drop anything covered by "Not violations" below. A clean scan is *not* a clean bill of health.
3. **Read what the scanner cannot judge.** Open and read these, whether or not they were flagged — each one is a documented gap in the tool (`rules/enforcement.md` → "What the tool cannot catch"):
   - **Repositories:** exported type aliases or re-exports that carry an ORM row type (`export type XRow = typeof t.x.$inferSelect`, `export type { … }`), and methods returning it. Then check who imports that alias — an importer looks clean because it imports from `./repository.js`.
   - **Service and domain files:** exported method signatures and parameter types. Contract-shaped input (`customer_id`, `line_items`, `*_cents`, Zod-inferred request types) means DTO fields leak into the service; services take domain shapes.
   - **Every route handler:** it must be validate → **one** service call → map/return. Inline counting, percentages, status/health derivation, branching on service results, or hand-rolled validation (`typeof` / regex checks on `req.params|body|query`, no `schema:`) are violations even when no forbidden import is involved.
   - **Anything importing `@devdigest/shared`:** enums and value types are fine inward; parsing or building a request/response *envelope* schema inside a service is not (envelopes stay at the edge).
   - **Indirect paths:** barrel files (`adapters/index.ts` re-exporting concrete adapters), `export * from`, and dynamic `import()`/`require` are still imports — follow them to the real target and judge that.
4. **Cover every file.** Use the ring map: every file must be either flagged-and-judged or read-and-judged. List the ones you read and found compliant.

### Reporting

- Cite the rule name (or checklist item) and `file:line` for every finding. One finding per distinct breach; do not merge unrelated problems.
- **Findings contain violations only.** Three sections, in this order: **Findings** (High/Medium), **Not violations (checked)**, **Other observations**.
- **Not violations — never list these under Findings, not even as Low, "optional" or "documented compromise but…":** put them under *Not violations (checked)* and say why they are allowed.
  - A route doing `new XService({ ...app.container.someRepo })` or reading `app.container` while wiring — routes and the composition root may touch the Container; assembling a service from ports there is allowed. (Calling `container.*` *inside a handler body* to reach a port is a different matter — that is a violation.)
  - File placement of mocks (`adapters/mocks.ts` vs a colocated `mock.ts`), file naming, or missing `types.ts`/`helpers.ts` when nothing is wrongly placed.
  - A service importing **its own** module's concrete `repository.ts` (documented compromise).
  - Importing another module through its public surface (`index.ts` / `types.ts`), type-only or not.
  - The `AppError` family thrown from services; `@devdigest/shared` enums/value types in inner rings; `platform/errors` and `platform/logger` imports; `fastify` in `routes.ts`, `modules/index.ts`, `_shared/context.ts`, `app.ts`.
  - Anything listed under "Documented compromises".
  - A string or identifier that merely *mentions* drizzle/fastify/adapter without importing it.
- **Other observations** is for real defects that are not layering (SQL bugs, duplicated business rules, missing FK, error-cause loss, `as` casts, atomicity). Keep it short and separate.
- **Severity:** High = breaks the dependency rule (inner → outer, cross-module private import, DB/SDK in a route, HTTP concept or `Db` handle in a service, platform → module, cycle). Medium = hidden leak the tool can't see (row types, DTO fields in services, logic or validation in a handler, envelope parsing in a service, config in an inner ring). Low = style/preference — omit unless asked.
- Give the smallest fix that restores the rule (move one file/import, add one port); do not propose restructuring the module.

## Documented compromises (do not "fix" without discussion)

- **`@devdigest/shared` is a shared kernel**: Zod contracts double as API DTOs *and* common vocabulary (`Provider`, `ReviewStrategy`, `CiFailOn`) used by services. Enums/value types may be shared inward; request/response *envelope* shapes stay at the edge. It is vendored — mirror changes into `client/src/vendor/shared`.
- **`AppError` carries `statusCode`** (`platform/errors.ts`). Services may throw the `AppError` family (`NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError`); the Fastify error handler is the only place that turns them into HTTP. Do not add other HTTP concepts (reply, req, headers) to inner rings.
- **`agents/` and `repos/` are the exemplars for file layout**, not yet for DI — they still take the whole `Container` (tracked in the baseline).
- Services may currently import their own module's concrete `repository.ts` class. Prefer typing against an interface in `types.ts` when you need a fake in unit tests (`rules/testing.md`).

## Enforcement & known debt

`server/.dependency-cruiser.cjs` encodes the rules (`routes-no-persistence`, `inner-no-outer`, `inner-no-container`, `only-repository-touches-db`, `adapters-no-modules`, `no-cross-module`, `platform-not-inward`, `no-circular`). Pre-existing violations are ratcheted in `server/.dependency-cruiser-known-violations.json` — it may only **shrink**. Details, the violation map and the refactor phases: [rules/enforcement.md](rules/enforcement.md).

## Rules index

- [rules/fastify.md](rules/fastify.md) — routes as the edge, validation, error mapping, plugins vs DI
- [rules/drizzle.md](rules/drizzle.md) — repositories, mappers, transactions, schema types stay in infra
- [rules/contracts-zod.md](rules/contracts-zod.md) — `@devdigest/shared` DTOs vs domain types, parse at the boundary
- [rules/adapters.md](rules/adapters.md) — ports for Anthropic/OpenAI/OpenRouter/Octokit/simple-git/ast-grep/ripgrep/tiktoken
- [rules/platform-di.md](rules/platform-di.md) — Container as composition root, `Deps` objects, jobs/SSE/logging
- [rules/testing.md](rules/testing.md) — fakes for ports, unit vs `*.it.test.ts`, route `inject`
- [rules/enforcement.md](rules/enforcement.md) — `pnpm arch:check`, baseline ratchet, violation map, refactor phases
- [examples.md](examples.md) — good/bad pairs taken from this repo
- [references.md](references.md) — sources and rationale (with links)

## Related skills

`fastify-best-practices` (HTTP mechanics), `drizzle-orm-patterns` (query/schema syntax), `zod` (schema API), `postgresql-table-design` (schema), `security` (secrets, input), `typescript-expert` (types). This skill decides **where code lives and what may import what**; those decide **how to write it**.
