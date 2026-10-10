# Development Plan: `mcp-server/` — local stdio MCP server for DevDigest (L04)

Status: PLAN ONLY, awaiting user go-ahead and answers to the open questions. No code written.
Produced by the `planner` agent; amended with onion-architecture and final tool descriptions.

## 1. Scope
New standalone package `mcp-server/` (`@devdigest/mcp-server`): Node/TypeScript MCP server, **stdio only**, an
**HTTP client** of the DevDigest API (default `http://localhost:3001`). No DB access, no imports from server code.
Exactly 5 tools, fixed order: `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius`
(the last reads `GET /pulls/:id/blast`, read-only).

Out of scope: HTTP/SSE transport, real blast-radius implementation (homework, specs/07), any change to `server/`,
`client/`, `reviewer-core/`, `e2e/`, wiring into `scripts/dev.sh`, harness config (pr-self-review routing table,
implementer agent list). The global AWS Lambda standards do NOT apply (local Node process).

## 2. Changes outside `mcp-server/` (docs/config only)
- `.mcp.json` (new, root): registers `devdigest`; no secrets.
- `AGENTS.md` (root): table row + link; "four packages" -> five.
- `TESTING.md`: suite-map row + short note.
- `.github/workflows/mcp-server.yml` (new): path filter `mcp-server/**`, modelled on `client.yml`.
- `specs/06-mcp-server.md` (new, written by doc-writer at the end; spec 07 already links to it).

## 3. Tool descriptions — FINAL, USE VERBATIM
These strings are final. The implementer MUST copy them character-for-character into each tool module's
`DESCRIPTION` constant (marked `// VERBATIM`), and `server-contract.test.ts` MUST assert equality with them.
Do not reword, shorten, or "improve" them. Open item: `get_conventions` wording may be revisited only if the user's
answer to Q1 changes the conventions source; otherwise it is final.

| Tool | Description (verbatim) |
|---|---|
| `list_agents` | List configured DevDigest reviewer agents (id, name, model). Call this first to get a valid `agent` for run_agent_on_pr / get_findings. |
| `run_agent_on_pr` | Run one reviewer agent on a PR and WAIT for it to finish (often 1–4 min; spends LLM credits). Returns {verdict, score, findings[]}. Reuses an in-flight run of the same agent. The only tool that writes. Use get_findings to re-read results. |
| `get_findings` | Read results of an already-finished DevDigest review on a PR. No new run, no cost. Default: latest review per agent. Pass agent or run_id to narrow, detail=full for rationale/suggestions. |
| `get_conventions` | Accepted house conventions for a repo (the repo-conventions from the DevDigest Conventions scan, L02). Read-only. Use them when writing or reviewing code in that repo. |
| `get_blast_radius` | Impact map for a PR from the DevDigest code index: changed symbols, their callers (file:line), and the HTTP endpoints/crons that depend on them. Read-only, no LLM, no cost. Returns status/degraded_reason when the index is incomplete. |

Server `instructions` (verbatim, target <= 450 chars):

> DevDigest: local AI PR reviews. Identify repos as owner/name and PRs by number. Flow: list_agents to get an agent → run_agent_on_pr (slow, minutes; spends LLM credits; the only tool that writes) → get_findings to re-read results for free. Prefer get_findings when a review already exists. get_blast_radius shows what else a PR's changes may affect (free).

Parameter descriptions: <= 80 chars each, e.g. `repo`: "Repo as owner/name, e.g. acme/api"; `pr`: "PR number, e.g. 42"; `agent`: "Agent id or exact name from list_agents".

Budgets enforced by test: 5 tools, fixed order, instructions <= 450 chars, each description <= 300, each param
describe <= 80, serialized `tools/list` <= 6,000 chars.

## 4. Design principles (from the user's slides; MUST be honored)
1. Result, not operation: `run_agent_on_pr(repo, pr, agent)` creates the run, waits, collects findings.
2. Flat arguments: repo, pr, agent as simple scalars; no nested objects; enums for closed sets.
3. Concise structured response: `{verdict, findings[]}` with only needed fields; hard cap `MAX_RESPONSE_CHARS = 16000`; `truncated: N` + hint when cut.
4. Error leads onward: every failure is `isError:true` text naming the next step (e.g. "Agent 'x' not found. Call list_agents…").

## 5. Package layout and onion-architecture
```
mcp-server/
  package.json (type:module; scripts start/typecheck/test/smoke), pnpm-lock.yaml,
  pnpm-workspace.yaml (allowBuilds: esbuild), tsconfig.json (strict, noUncheckedIndexedAccess, NodeNext), vitest.config.ts
  AGENTS.md  CLAUDE.md(@AGENTS.md)  INSIGHTS.md  README.md
  src/index.ts        composition root: config -> createServer -> StdioServerTransport; signals; console->stderr guard
  src/server.ts       createServer(deps): McpServer + instructions + registerTools (testable w/o stdio)
  src/config.ts       Zod-parsed env
  src/log.ts          JSON-lines logger -> stderr ONLY
  src/http.ts         ApiClient adapter (injectable fetch): get/post, timeouts, error envelope -> ApiError/ApiUnreachableError
  src/api-schemas.ts  local Zod schemas for consumed response fields only (no @devdigest/shared alias)
  src/resolve.ts      resolveRepo / resolvePull / resolveAgent (+ typed not-found errors)
  src/errors.ts       toolError / toToolResult; error -> "leads onward" text
  src/format.ts       PURE shaping (severity sort, truncate, latest-per-agent, worst verdict, response cap)
  src/wait.ts         PURE-ish waitForRun (sleep/now/signal injected)
  src/tools/{list-agents,run-agent-on-pr,get-findings,get-conventions,get-blast-radius}.ts + index.ts (single registration point)
  scripts/smoke.ts    stdio client smoke test (read-only by default)
  test/**
```
Onion-architecture (principles applied; skill is server/-scoped so `pnpm arch:check` etc. do not transfer — implementer
loads the `onion-architecture` skill and verifies which rules apply):
- Dependency rule: `tools/*` depend on `resolve`, `format`, `wait`, and an `ApiClient` **interface (port)**.
- Only `http.ts` implements that port with real `fetch` (adapter); tools never import `http.ts` directly.
- `format.ts` / `wait.ts` do no I/O; clock, sleep, fetch injected.
- Only `index.ts` wires concrete adapters (composition root).
- No imports from `server/`, `client/`, `reviewer-core/`.

## 6. Configuration (env only; no .env file, no secrets)
| Var | Default | Rule |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | http(s); strip trailing slash |
| `DEVDIGEST_RUN_WAIT_MS` | `240000` | clamp 10,000..600,000 |
| `DEVDIGEST_POLL_INTERVAL_MS` | `2000` | — |
| `DEVDIGEST_HTTP_TIMEOUT_MS` | `15000` | PR-list and review POST use max(this, 30000) |
| `DEVDIGEST_MCP_LOG_LEVEL` | `info` | — |
Invalid value -> one stderr line, exit 1. Logs: stderr only, never full bodies or finding text.

## 7. Tool behavior
Common flat args: `repo` string (owner/name; bare name allowed if unique), `pr` coerced positive int, `agent` string (id or exact name).

**Resolution:** `resolveRepo` via `GET /repos` (case-insensitive `full_name`; ambiguity -> error listing candidates);
`resolvePull` via `GET /repos/:id/pulls` (by `number`; null `id` = not found; this call syncs from GitHub, idempotent);
`resolveAgent` via `GET /agents` (id exact, else name case-insensitive exact; resolve BEFORE POST because
`RunRequest.agentId` is unvalidated). Disabled agents allowed (flagged `agent_enabled:false`). No caching in v1.

**list_agents** — `include_disabled?`. `GET /agents`. Returns `{agents:[{id,name,description<=140,provider,model,enabled}], count, hidden_disabled}`; strips `system_prompt`, `output_schema`. Empty = hint, not error. readOnly/idempotent.

**run_agent_on_pr** — `repo, pr, agent`. Algorithm: resolve -> `GET /pulls/:id/runs/active`, reuse same-agent in-flight run
(`reused_active_run:true`) else `POST /pulls/:id/review {agentId}` (no auto-retry; spends credits) -> `waitForRun`
(poll `GET /pulls/:id/runs`, 2s x1.5 backoff cap 10s; statuses running|done|failed|cancelled; 3 consecutive poll
failures -> "lost contact, call get_findings with run_id"; progress notifications if token present; abort stops polling
but does NOT cancel server run) -> on `done` `GET /pulls/:id/reviews`, match `run_id` (retry 3x/1s if row not yet visible)
-> concise shape. Deadline reached = NOT an error: `{status:"running", run_id, agent, waited_s, hint:"Still running. Call get_findings with repo, pr and run_id=<id> in ~1 min."}`.
README: set `MCP_TOOL_TIMEOUT` >= `DEVDIGEST_RUN_WAIT_MS` + 30s. Annotations: readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:true.

**get_findings** — `repo, pr, agent?, run_id?(uuid), detail?(concise|full), limit?(1..50, default 20)`. Selection: `run_id` > `agent`
(newest) > latest-per-agent (server INSIGHTS 2026-09-18; null agent_id kept separately). Missing run explained via `/runs`
(running / failed / not on PR). Output: `{repo, pr, verdict, score, counts, findings:[{severity,category,title,file,line,end_line?,agent?}], truncated, hidden_dismissed}`;
overall verdict = worst, score = min; sorted CRITICAL>WARNING>SUGGESTION then file/line; dismissed hidden + counted.
`full` adds id, rationale(<=600), suggestion(<=400). Implementer must check what produces `kind='summary'` rows (Q8). readOnly/idempotent.

**get_conventions** — `repo, category?, limit?(1..100, default 40)`. `GET /repos/:id/conventions`, keep `status==='accepted'`,
sort confidence desc then occurrences desc. NEVER call `/extract` (costs money). Output `{repo,count,conventions:[{rule,category,rationale<=200,evidence:"path:line"}],truncated,pending}`; zero accepted = hint, not error. readOnly/idempotent.

**get_blast_radius** — `repo, pr` (same flat shape as the future real tool). Zero HTTP calls; `isError:true`
"get_blast_radius is not implemented yet in devdigest-mcp. Use get_findings(repo, pr) for review results." Handler factory takes no deps. readOnly.

**Error mapping:** unreachable -> "DevDigest API not reachable at <url>. Start it with ./scripts/dev.sh (API :3001) or set DEVDIGEST_API_URL."; 429 -> "rate limit hit (reviews: 10/min). Wait ~60s, then retry."; 400/422 -> "Invalid request: <msg>."; 404 -> re-resolved into specific Repo/PR/Agent message with candidate list (max 10); 5xx -> "DevDigest API error <code>: <msg>. Check the API terminal logs."; schema mismatch -> "Unexpected API response shape for <endpoint> (API/MCP version mismatch?)". Messages <=300 chars, no stack traces. Every handler wrapped so exceptions become `isError:true`.

## 8. Token-budget measures and verification
No alwaysLoad; 5 tools; short instructions; fixed order; no outputSchema/structuredContent; compact JSON single text item;
response cap enforced in code; budgets enforced by unit test; manual `/mcp` and `/context` before/after, numbers recorded in `mcp-server/INSIGHTS.md`.

## 9. `.mcp.json` (root, no secrets)
```json
{ "mcpServers": { "devdigest": {
  "command": "node",
  "args": ["${CLAUDE_PROJECT_DIR:-.}/mcp-server/node_modules/tsx/dist/cli.mjs",
           "${CLAUDE_PROJECT_DIR:-.}/mcp-server/src/index.ts"],
  "env": { "DEVDIGEST_API_URL": "${DEVDIGEST_API_URL:-http://localhost:3001}" } } } }
```
Fallback if tsx stdio relay fails on Windows: compile to `dist/`.

## 10. Steps and owners
0. **researcher** — verify (no code): SDK v1 vs v2, `instructions` option, annotation names, Zod major, `extra.signal`/progress API, InMemoryTransport/Client, Claude Code MCP_TOOL_TIMEOUT + per-server timeout + `${VAR:-default}`, tsx stdio on Windows.
1. **implementer** — scaffold package (package.json, pnpm-workspace.yaml, tsconfig, vitest config).
2. implementer — `config.ts`, `log.ts` (+ config test).
3. implementer — `http.ts`, `api-schemas.ts`.
4. implementer — `resolve.ts`, `errors.ts`.
5. implementer — `format.ts`, `wait.ts` (+ format test).
6. implementer — `list-agents.ts`, `get-conventions.ts`.
7. implementer — `get-findings.ts`.
8. implementer — `run-agent-on-pr.ts`.
9. implementer — `get-blast-radius.ts` stub (+ "fetch never called" test).
10. implementer — `tools/index.ts`, `server.ts`, `index.ts` (+ no-stdout scan test).
11. **test-writer** — resolve, errors, wait, get-findings, run-agent-on-pr, list-agents, get-conventions, server-contract tests (mocked fetch, fake timers, InMemoryTransport); cases from this plan, not from the implementation. server-contract asserts descriptions equal Section 3 verbatim.
12. implementer — `scripts/smoke.ts` (run_agent_on_pr only with explicit `--run`).
13. implementer — `.mcp.json`.
14. implementer — `.github/workflows/mcp-server.yml`.
15. implementer — `mcp-server/AGENTS.md`, `CLAUDE.md` stub, `INSIGHTS.md`, `README.md` (AGENTS lists get_blast_radius under "Do not touch").
16. implementer — root `AGENTS.md`, `TESTING.md` rows.
17. **plan-verifier** — closed-list check of steps 1–16 vs this plan (names, order, annotations, budgets, verbatim descriptions, zero-call stub).
18. **architecture-reviewer** — boundaries of `mcp-server/` incl. onion dependency rule, no imports from other packages, pure helpers, single registration point, spec 07 consistency.
19. **security-reviewer** — prompt injection via returned findings/conventions, `DEVDIGEST_API_URL` trust, cost-incurring write tool, dependency supply chain, stdout leakage.
20. **doc-writer** — `specs/06-mcp-server.md` with a `run_agent_on_pr` sequence diagram.

Skills for implementer: typescript-expert, security (all `.ts`), zod (files importing zod), onion-architecture (package layout; principles only),
engineering-insights (INSIGHTS.md). Not applicable: fastify, drizzle, postgres, frontend/react/next skills.

## 11. Verification
`cd mcp-server && pnpm install --frozen-lockfile && pnpm typecheck && pnpm test`; with API running `pnpm smoke <owner/name>`;
Claude Code `/mcp` (5 tools, in order) and `/context` delta; one user-approved manual `run_agent_on_pr` on a seeded PR.

## 12. Open questions (need user answers before step 1)
- Q1 conventions source: accepted per-repo candidates (default) vs workspace `repo-conventions` skill text (last-repo-wins).
- Q2 on abort/timeout: leave server run running (default) vs cancel via `POST /runs/:id/cancel`.
- Q3 defaults: hide disabled agents and dismissed findings (with counts).
- Q4 package manager: pnpm (default, per spec 07) vs npm.
- Q5 label/wrap LLM-derived finding/convention text against prompt injection?
- Q6 non-loopback `DEVDIGEST_API_URL`: refuse vs warn.
- Q8 what produces `reviews.kind='summary'` rows (implementer verifies before step 7).
- Q9 SDK v1 vs v2 and unverified API details (step 0).
