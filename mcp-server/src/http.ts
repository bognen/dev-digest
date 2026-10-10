import {
  ApiError,
  ApiResponseTooLargeError,
  ApiSchemaError,
  ApiUnreachableError,
  clampMessage,
  sanitizeText,
} from "./errors.js";
import { silentLogger, type Logger } from "./log.js";
import type { ApiClient, RequestOptions } from "./ports.js";

/**
 * Adapter implementing the ApiClient port with real fetch (injectable for
 * tests). The only module in the package that performs network I/O.
 */

export interface HttpClientOptions {
  /** http(s) base URL, no trailing slash. */
  baseUrl: string;
  defaultTimeoutMs: number;
  fetch?: typeof fetch;
  logger?: Logger;
}

const MAX_API_MESSAGE_CHARS = 200;
/** Hard cap on any response body read into memory. */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/**
 * Read a response body as text, refusing more than `cap` bytes: rejects early on
 * a declared content-length over the cap, otherwise counts bytes as they stream
 * and cancels the transfer once the cap is crossed.
 */
async function readBodyCapped(res: Response, cap: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) {
    await res.body?.cancel().catch(() => undefined);
    throw new ApiResponseTooLargeError(cap);
  }
  if (!res.body) return await res.text();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      throw new ApiResponseTooLargeError(cap);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function extractApiMessage(text: string, status: number): { message: string; code?: string } {
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object") {
      const rec = body as Record<string, unknown>;
      const envelope = rec.error;
      if (envelope && typeof envelope === "object") {
        const e = envelope as Record<string, unknown>;
        const message = typeof e.message === "string" ? e.message : undefined;
        const code = typeof e.code === "string" ? e.code : undefined;
        if (message) {
          return { message: clampMessage(sanitizeText(message), MAX_API_MESSAGE_CHARS), code };
        }
      }
      // Fastify default shape: { statusCode, error: "Not Found", message }
      if (typeof rec.message === "string") {
        return { message: clampMessage(sanitizeText(rec.message), MAX_API_MESSAGE_CHARS) };
      }
    }
  } catch {
    // non-JSON error body: fall through
  }
  return { message: `HTTP ${status}` };
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

export function createHttpApiClient(opts: HttpClientOptions): ApiClient {
  const doFetch = opts.fetch ?? fetch;
  const log = opts.logger ?? silentLogger;

  async function request(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    ro: RequestOptions | undefined,
  ): Promise<unknown> {
    if (!path.startsWith("/")) throw new Error(`API path must start with "/": ${path}`);
    const url = opts.baseUrl + path;
    const label = path.split("?")[0] ?? path; // never log query strings

    const timeoutMs = ro?.timeoutMs ?? opts.defaultTimeoutMs;
    const timeoutCtl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeoutCtl.abort();
    }, timeoutMs);
    const signal = ro?.signal ? AbortSignal.any([ro.signal, timeoutCtl.signal]) : timeoutCtl.signal;

    const headers: Record<string, string> = { accept: "application/json" };
    const init: RequestInit = { method, headers, signal, redirect: "error" };
    if (method === "POST") {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body ?? {});
    }

    const started = Date.now();
    let res: Response;
    let text: string;
    try {
      res = await doFetch(url, init);
      text = await readBodyCapped(res, MAX_RESPONSE_BYTES);
    } catch (err) {
      if (err instanceof ApiResponseTooLargeError) {
        log.warn("http response too large", { method, path: label, limitBytes: MAX_RESPONSE_BYTES });
        throw err;
      }
      if (timedOut) {
        log.warn("http timeout", { method, path: label, timeoutMs });
        throw new ApiUnreachableError(opts.baseUrl, "timeout");
      }
      if (ro?.signal?.aborted || isAbortError(err)) throw err; // caller cancellation
      log.warn("http network error", { method, path: label, error: err });
      throw new ApiUnreachableError(opts.baseUrl, "network");
    } finally {
      clearTimeout(timer);
    }

    log.debug("http", { method, path: label, status: res.status, ms: Date.now() - started });

    if (!res.ok) {
      const { message, code } = extractApiMessage(text, res.status);
      throw new ApiError(res.status, message, code);
    }
    if (text === "") return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ApiSchemaError(label);
    }
  }

  return {
    get: (path, ro) => request("GET", path, undefined, ro),
    post: (path, body, ro) => request("POST", path, body, ro),
  };
}
