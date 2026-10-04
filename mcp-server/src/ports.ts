/**
 * Ports owned by the inner rings (tools, resolve, wait). Only http.ts
 * implements them with real I/O; tests supply fakes.
 */

export interface RequestOptions {
  /** Per-call timeout override in ms (defaults to the client's default). */
  timeoutMs?: number;
  /** Caller cancellation (MCP request abort). */
  signal?: AbortSignal;
}

/** Minimal read/write view of the DevDigest HTTP API. Returns parsed JSON (unvalidated). */
export interface ApiClient {
  get(path: string, opts?: RequestOptions): Promise<unknown>;
  post(path: string, body: unknown, opts?: RequestOptions): Promise<unknown>;
}
