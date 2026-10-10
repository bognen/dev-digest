import type { Logger } from "./log.js";
import { safeOrigin, sanitizeText } from "./sanitize.js";

/**
 * Typed errors + the single mapping from any thrown error to an MCP tool
 * result whose text "leads onward" (names the next step). No stack traces, every
 * message <= MAX_MESSAGE_CHARS, control characters stripped from API-sourced text.
 */

export const MAX_MESSAGE_CHARS = 300;
export const MAX_CANDIDATES = 10;

// ---- Error classes (inner ring; http.ts imports them, never the reverse) ----

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Server-provided message (already sanitized/truncated by the adapter). */
    readonly apiMessage: string,
    readonly code?: string,
  ) {
    super(`DevDigest API ${status}: ${apiMessage}`);
    this.name = "ApiError";
  }
}

export class ApiUnreachableError extends Error {
  constructor(
    readonly baseUrl: string,
    readonly reason: "network" | "timeout" = "network",
  ) {
    super(`DevDigest API not reachable at ${safeOrigin(baseUrl)} (${reason})`);
    this.name = "ApiUnreachableError";
  }
}

export class ApiSchemaError extends Error {
  constructor(readonly endpoint: string) {
    super(`Unexpected API response shape for ${endpoint}`);
    this.name = "ApiSchemaError";
  }
}

/** Response body exceeded the adapter's byte cap (memory/DoS guard). */
export class ApiResponseTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`API response too large (> ${limitBytes} bytes)`);
    this.name = "ApiResponseTooLargeError";
  }
}

export type EntityKind = "repo" | "pr" | "agent";

export class NotFoundError extends Error {
  constructor(
    readonly kind: EntityKind,
    readonly input: string,
    /** Up to MAX_CANDIDATES valid alternatives. */
    readonly candidates: readonly string[] = [],
    /** Extra context, e.g. the repo a PR was looked up in. */
    readonly scope?: string,
  ) {
    super(`${kind} not found: ${input}`);
    this.name = "NotFoundError";
  }
}

export class AmbiguousMatchError extends Error {
  constructor(
    readonly kind: EntityKind,
    readonly input: string,
    readonly candidates: readonly string[],
  ) {
    super(`${kind} ambiguous: ${input}`);
    this.name = "AmbiguousMatchError";
  }
}

/** waitForRun gave up after consecutive poll failures. */
export class RunLostContactError extends Error {
  constructor(readonly runId: string) {
    super(`Lost contact while waiting for run ${runId}`);
    this.name = "RunLostContactError";
  }
}

// ---- Tool result shape (SDK-independent; structurally compatible with MCP CallToolResult) ----

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface ErrorContext {
  apiUrl: string;
  logger?: Logger;
}

// sanitizeText lives in sanitize.ts (pure, shared with format.ts); re-exported for existing callers.
export { sanitizeText };

export function clampMessage(text: string, max = MAX_MESSAGE_CHARS): string {
  return text.length <= max ? text : text.slice(0, Math.max(0, max - 3)) + "...";
}

function candidateList(candidates: readonly string[]): string {
  const shown = candidates.slice(0, MAX_CANDIDATES).map(sanitizeText);
  const more = candidates.length > shown.length ? ", ..." : "";
  return shown.join(", ") + more;
}

function notFoundMessage(e: NotFoundError): string {
  const input = sanitizeText(e.input);
  const list = candidateList(e.candidates);
  switch (e.kind) {
    case "repo":
      return list
        ? `Repo '${input}' not found. Known repos: ${list}. Pass repo as owner/name.`
        : `Repo '${input}' not found and no repos are connected. Add the repo in the DevDigest UI first.`;
    case "pr": {
      const where = e.scope ? ` in ${sanitizeText(e.scope)}` : "";
      return list
        ? `PR #${input} not found${where}. Available PR numbers: ${list}.`
        : `PR #${input} not found${where}, and no PRs are synced for it. Check the number on GitHub.`;
    }
    case "agent":
      return list
        ? `Agent '${input}' not found. Call list_agents to get a valid agent (known: ${list}).`
        : `Agent '${input}' not found. Call list_agents to get a valid agent.`;
  }
}

/** Map any thrown value to the "leads onward" message text (<= 300 chars). */
export function errorMessage(err: unknown, ctx: ErrorContext): string {
  if (err instanceof NotFoundError) return clampMessage(notFoundMessage(err));

  if (err instanceof AmbiguousMatchError) {
    const what = err.kind === "repo" ? "Use owner/name" : "Use the id";
    return clampMessage(
      `${err.kind === "repo" ? "Repo" : "Agent"} '${sanitizeText(err.input)}' is ambiguous: ${candidateList(err.candidates)}. ${what}.`,
    );
  }

  if (err instanceof ApiUnreachableError) {
    return clampMessage(
      `DevDigest API not reachable at ${safeOrigin(ctx.apiUrl)}. Start it with ./scripts/dev.sh (API :3001) or set DEVDIGEST_API_URL.`,
    );
  }

  if (err instanceof ApiSchemaError) {
    return clampMessage(
      `Unexpected API response shape for ${sanitizeText(err.endpoint)} (API/MCP version mismatch?)`,
    );
  }

  if (err instanceof ApiResponseTooLargeError) {
    return clampMessage(
      "API response too large. Narrow the request (smaller limit, an agent filter) or check the DevDigest API.",
    );
  }

  if (err instanceof RunLostContactError) {
    return clampMessage(
      `Lost contact with the DevDigest API while the run was in progress. Call get_findings with repo, pr and run_id=${sanitizeText(err.runId)} to check the result.`,
    );
  }

  if (err instanceof ApiError) {
    const msg = sanitizeText(err.apiMessage);
    if (err.status === 429) {
      return clampMessage("Rate limit hit (reviews: 10/min). Wait ~60s, then retry.");
    }
    if (err.status === 400 || err.status === 422) {
      return clampMessage(`Invalid request: ${msg}.`);
    }
    if (err.status === 404) {
      return clampMessage(
        `Not found: ${msg}. Check repo, pr and agent (call list_agents for valid agents).`,
      );
    }
    if (err.status >= 500) {
      return clampMessage(`DevDigest API error ${err.status}: ${msg}. Check the API terminal logs.`);
    }
    return clampMessage(`DevDigest API error ${err.status}: ${msg}.`);
  }

  if (err instanceof Error && err.name === "AbortError") {
    return "Request cancelled. The DevDigest run (if any) keeps running; call get_findings later.";
  }

  ctx.logger?.error("unhandled tool error", { error: err });
  return "Unexpected error in devdigest-mcp. Check the MCP server stderr log.";
}

export function toolError(message: string): ToolResult {
  return { isError: true, content: [{ type: "text", text: clampMessage(message) }] };
}

export function toToolResult(err: unknown, ctx: ErrorContext): ToolResult {
  return toolError(errorMessage(err, ctx));
}

/** Success result: one compact-JSON text item (no structuredContent/outputSchema). */
export function textResult(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

/** Wrap a tool handler so any exception becomes an isError:true result. */
export function safeHandler<A extends unknown[]>(
  ctx: ErrorContext,
  handler: (...args: A) => Promise<ToolResult>,
): (...args: A) => Promise<ToolResult> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      return toToolResult(err, ctx);
    }
  };
}
