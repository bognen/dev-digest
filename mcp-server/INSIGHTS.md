# mcp-server Insights

## What Works

### 2026-10-03 — Scan test must not match itself
`test/no-stdout.test.ts` builds the forbidden needles from string parts, and `src/index.ts` installs the console-to-stderr guard via `console[method] = console.error.bind(console)` so neither contains the literal `console.log(` / `process.stdout` the scan forbids.

### 2026-10-03 — Keep ports and error classes out of http.ts
`ApiClient` lives in `src/ports.ts` and the `Api*Error` classes in `src/errors.ts`; `http.ts` (the only fetch adapter) imports them, never the reverse. This keeps `resolve`/`wait`/tools free of any runtime import of the adapter (onion dependency rule).

## What Doesn't Work

## Codebase Patterns

### 2026-10-05 — get_blast_radius own `hint` is overwritten when the cap truncates
`capResponse` (format.ts) sets its own `hint` when it drops `downstream` items, replacing the "Index incomplete" hint from `shapeBlast`. `status`/`degraded_reason` stay in the payload, so the signal is not lost, but do not rely on `hint` alone for degradation (`src/tools/blast-payload.ts`).

### 2026-10-03 — Security hardening decisions (untrusted field, loopback default, single-flight)
- Prompt-injection labeling is a constant first-key `untrusted` field on findings/conventions/agents payloads (`format.ts` `withUntrusted`, applied in `cappedResult`), NOT description wording: tool descriptions and server instructions are frozen VERBATIM (tested, token budgets). `capResponse` re-spreads the payload, so the key survives truncation; its last-resort path now emits a minimal valid JSON object instead of a raw slice (a slice could yield unparseable text).
- All API-sourced strings are sanitized (`sanitize.ts`: C0/C1, bidi, zero-width, BOM, U+2028/9, Unicode tag chars U+E0000-E007F need the `u` flag) and per-field capped in SUCCESS payloads too, not just error paths. Rationale/suggestion keep newlines (`stripUnsafe`); single-line fields are whitespace-collapsed.
- `DEVDIGEST_API_URL` defaults to loopback only; remote needs `DEVDIGEST_ALLOW_REMOTE_API=1` AND https, plus a stderr warning written directly (not via the leveled logger, so `DEVDIGEST_MCP_LOG_LEVEL=error` cannot hide it). Every message shows `safeOrigin()` only (URLs may carry userinfo).
- Single-flight in `run_agent_on_pr` is per-process only (map keyed `pull.id:agent.id`, per handler instance); a joiner shares the first caller's start, including its abort signal. Cross-process duplicates still need the server-side atomic guard (see the racy-reuse entry below).

### 2026-10-03 — In-flight run reuse is a best-effort client guard (racy)
`run_agent_on_pr` checks for an in-flight run of the same agent before POSTing, but check-then-POST is not atomic: two concurrent callers can both see none and both POST, billing twice. The proper fix is a server-side atomic rule in the reviews service (follow-up, out of scope for mcp-server).

### 2026-10-03 — Local Zod schemas instead of an alias to server/src/vendor/shared
`src/api-schemas.ts` defines its own response schemas rather than aliasing `server/src/vendor/shared`, keeping the package standalone. Consequence: a renamed API field is caught at runtime (`ApiSchemaError`, or `pnpm smoke`), not at compile time.

### 2026-10-03 — Q8 settled: nothing writes reviews.kind='summary'
Server code only ever persists `kind:'review'` (`server/src/modules/reviews/run-executor.ts:326`); `'summary'` exists only in the enum/contracts, and `pulls/repository.ts:145` itself filters to `'review'`. `get_findings` and `run_agent_on_pr` therefore ignore non-`review` rows; they would carry no per-agent findings anyway.

### 2026-10-03 — Timeouts map to ApiUnreachableError, caller aborts do not
`src/http.ts` distinguishes its own timeout (`ApiUnreachableError(reason:"timeout")`) from a caller `AbortSignal` (rethrown as AbortError). `waitForRun` relies on this: an abort returns state `aborted`, three consecutive poll failures throw `RunLostContactError`.

## Tool & Library Notes

### 2026-10-03 — SDK v2 (`@modelcontextprotocol/server@2.3.0`) API shape
`registerTool` needs `inputSchema: z.object(...)` (raw shapes are deprecated); handler ctx is `ctx.mcpReq.{signal,_meta,notify}`; progress is `ctx.mcpReq.notify({method:"notifications/progress",...})` and only valid when `_meta.progressToken` is set. `InMemoryTransport` is exported from the server package, `Client` from `@modelcontextprotocol/client` (devDependency only). Tools stay SDK-independent: `tools/index.ts` is the only file adapting `ServerContext` into `ToolCallContext`.

### 2026-10-03 — Smoke client does not forward DEVDIGEST_API_URL
`StdioClientTransport` spawns the child with a restricted default env, so `DEVDIGEST_API_URL=... pnpm smoke` still hit `localhost:3001`. Pass `env` explicitly in `scripts/smoke.ts` if you need to point it elsewhere.

### 2026-10-03 — Heredocs with escaped control-char regexes break the Bash tool
Writing `errors.ts` through a shell heredoc failed (unbalanced quote parse) because of the `\u0000` regex and backticks; use the Write tool for source files containing them.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
