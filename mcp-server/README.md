# @devdigest/mcp-server

Local **stdio** MCP server that lets a coding agent (Claude Code) use DevDigest:
list reviewer agents, run one on a PR, read findings and repo conventions. It
talks to the DevDigest API over HTTP; it never touches the database.

## Prerequisites
- Node >=22 and pnpm >=10.
- DevDigest API running: `./scripts/dev.sh` from the repo root (API on :3001).
- `cd mcp-server && pnpm install`

## Configuration
Environment variables only (no `.env` file, no secrets). Invalid values print one
line to stderr and exit 1.

| Var | Default | Rule |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | loopback only (`localhost`, `127.0.0.0/8`, `::1`); no userinfo/query/fragment; trailing slash stripped |
| `DEVDIGEST_ALLOW_REMOTE_API` | unset | `1` allows a non-loopback API URL, which must be `https://` (a stderr warning is printed at startup) |
| `DEVDIGEST_RUN_WAIT_MS` | `240000` | max wait in `run_agent_on_pr`; clamped to 10000..600000 |
| `DEVDIGEST_POLL_INTERVAL_MS` | `2000` | positive integer (polling backs off up to 10s) |
| `DEVDIGEST_HTTP_TIMEOUT_MS` | `15000` | per-request timeout; PR-list and review POST use `max(this, 30000)` |
| `DEVDIGEST_MCP_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`; logs go to stderr only |

## Use from Claude Code
The repo-root [`.mcp.json`](../.mcp.json) registers the server as `devdigest`
(`node` + tsx's `cli.mjs` running `src/index.ts`; `DEVDIGEST_API_URL` is passed
through, defaulting to `http://localhost:3001`). Claude Code reads it when you
open the project.

1. Start Claude Code in the repo root.
2. Project-scoped servers need approval: accept the `devdigest` prompt in the
   interactive session (or approve it via `/mcp`).
3. Run `/mcp` to check that `devdigest` is connected and lists 5 tools.

`run_agent_on_pr` spends LLM credits; keep it on "ask" in your permissions.

## Timeouts
- Claude Code's default MCP tool timeout (`MCP_TOOL_TIMEOUT`, in ms) is very
  long, so a `run_agent_on_pr` call is not cut off by it. If you lower
  `MCP_TOOL_TIMEOUT` or set a per-server `timeout` in `.mcp.json`, keep it at
  least `DEVDIGEST_RUN_WAIT_MS` + 30s.
- For stdio servers there is a 30 minute idle timeout, reset by progress
  notifications; the server emits them while waiting for a run.
- `DEVDIGEST_RUN_WAIT_MS` bounds the wait. When it elapses the tool returns
  `{status:"running", run_id, ...}` (not an error) and the run keeps going on the
  API; read it later with `get_findings` and that `run_id`.

## MCP Inspector
```sh
cd mcp-server
pnpm inspect
```
Runs the Inspector (pinned to 2.9.0, downloaded by `npx` on first use) against
`src/index.ts`. It prints a local URL; Connect, then use the Tools tab. Set
`DEVDIGEST_API_URL` in your shell first if the API is not on :3001.

## Smoke test
With the API running:
```sh
cd mcp-server
pnpm smoke                                   # read-only: tools/list and list_agents
pnpm smoke <owner/name>                      # also calls get_conventions for that repo
pnpm smoke --run <owner/name> <pr> <agent>   # calls run_agent_on_pr (spends LLM credits)
```

## Tools
Arguments are flat scalars. `repo` is `owner/name` (a bare name works if unique),
`pr` is the PR number, `agent` is an agent id or exact name from `list_agents`.

| Tool | Purpose | Sample arguments |
|---|---|---|
| `list_agents` | List reviewer agents (id, name, description, model, enabled) | `{}` or `{"include_disabled": true}` |
| `run_agent_on_pr` | Run an agent on a PR and wait for the result (writes; costs credits) | `{"repo": "acme/api", "pr": 42, "agent": "Security reviewer"}` |
| `get_findings` | Read finished review results, no new run | `{"repo": "acme/api", "pr": 42}`; narrow with `"agent"` or `"run_id"`, or pass `"all_runs": true` for every run; `"detail": "full"`, `"limit": 20`. Response includes `total_findings` |
| `get_conventions` | Accepted repo conventions, read-only | `{"repo": "acme/api", "category": "naming", "limit": 40}` |
| `get_blast_radius` | Impact map for a PR (changed symbols, callers with file:line, affected endpoints/crons) from the code index; read-only, free; reports status/degraded_reason + a hint when the index is incomplete | `{"repo": "acme/api", "pr": 42}` |

Typical flow: `list_agents` -> `run_agent_on_pr` -> `get_findings` to re-read.

## Development
```sh
pnpm typecheck
pnpm test
```
See [AGENTS.md](./AGENTS.md) for conventions and layout.
