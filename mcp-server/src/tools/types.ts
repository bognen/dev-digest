import { z } from "zod";
import type { Config } from "../config.js";
import { capResponse, withUntrusted } from "../format.js";
import type { Logger } from "../log.js";
import type { ApiClient } from "../ports.js";
import type { ToolResult } from "../errors.js";

/**
 * Shared shapes for tool modules. SDK-independent on purpose: tools see only
 * the ApiClient port, config, and a minimal per-call context, so they can be
 * unit-tested without the MCP SDK. tools/index.ts adapts the SDK context.
 */

export interface ToolDeps {
  api: ApiClient;
  config: Config;
  logger: Logger;
  /** Abortable sleep; supplied by the composition root (src/clock.ts) or a test clock. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Wall clock in ms; supplied by the composition root or a test clock. */
  now: () => number;
}

export interface ProgressUpdate {
  progress: number;
  total?: number;
  message?: string;
}

/** Per-call context; `progress` is present only when the client sent a progressToken. */
export interface ToolCallContext {
  signal?: AbortSignal;
  progress?: (update: ProgressUpdate) => Promise<void> | void;
}

export interface ToolAnnotationsDef {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** Shared flat-argument schemas (each describe() <= 80 chars). */
export const repoParam = z.string().min(1).describe("Repo as owner/name, e.g. acme/api");
export const prParam = z.coerce.number().int().positive().describe("PR number, e.g. 42");
export const agentParam = z.string().min(1).describe("Agent id or exact name from list_agents");

export const MAX_FINDINGS_DEFAULT = 20;

/**
 * Success result for list-shaped payloads carrying API-sourced text: prepends the
 * constant `untrusted` notice as the FIRST key, then cuts to MAX_RESPONSE_CHARS.
 */
export function cappedResult(payload: Record<string, unknown>, listKey: string): ToolResult {
  return { content: [{ type: "text", text: capResponse(withUntrusted(payload), listKey).text }] };
}

/** Request options for API calls that must honour request cancellation. */
export function signalOpts(ctx: ToolCallContext | undefined): { signal?: AbortSignal } {
  return ctx?.signal ? { signal: ctx.signal } : {};
}
