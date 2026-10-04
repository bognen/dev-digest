import { z } from "zod";

/**
 * Runtime configuration, parsed from environment variables only (no .env file,
 * no secrets). Pure: takes an env record, returns a typed Config or throws a
 * ConfigError whose message is a single human-readable line.
 */

export const DEFAULT_API_URL = "http://localhost:3001";
export const RUN_WAIT_MIN_MS = 10_000;
export const RUN_WAIT_MAX_MS = 600_000;
/** PR-list and review POST use max(httpTimeoutMs, this). */
export const LONG_HTTP_TIMEOUT_FLOOR_MS = 30_000;

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  /** http(s) base URL of the DevDigest API, no trailing slash. */
  apiUrl: string;
  /** True when apiUrl is a non-loopback host (opted in via DEVDIGEST_ALLOW_REMOTE_API=1); index.ts warns. */
  apiIsRemote: boolean;
  /** Max time run_agent_on_pr waits for a run, clamped to 10s..600s. */
  runWaitMs: number;
  pollIntervalMs: number;
  httpTimeoutMs: number;
  /** Derived: max(httpTimeoutMs, 30000) for slow calls (PR list sync, review POST). */
  longHttpTimeoutMs: number;
  logLevel: LogLevel;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const positiveInt = z.coerce.number().int().positive();

const IPV4_LOOPBACK = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** localhost, 127.0.0.0/8, ::1 (URL.hostname keeps IPv6 in brackets). */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "[::1]" || h === "::1" || IPV4_LOOPBACK.test(h);
}

/**
 * Validate DEVDIGEST_API_URL. Never echoes the raw value (it may carry
 * credentials): errors name only the origin, or nothing if unparsable.
 */
function parseApiUrl(rawValue: string, allowRemote: boolean): { apiUrl: string; remote: boolean } {
  const name = "DEVDIGEST_API_URL";
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new ConfigError(`Invalid ${name}: not a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError(`Invalid ${name}: must start with http:// or https://`);
  }
  const origin = url.origin;
  if (url.username !== "" || url.password !== "") {
    throw new ConfigError(`Invalid ${name} (${origin}): credentials in the URL are not allowed`);
  }
  if (url.search !== "" || url.hash !== "" || rawValue.includes("?") || rawValue.includes("#")) {
    throw new ConfigError(`Invalid ${name} (${origin}): query string and fragment are not allowed`);
  }
  const remote = !isLoopbackHost(url.hostname);
  if (remote) {
    if (!allowRemote) {
      throw new ConfigError(
        `Invalid ${name} (${origin}): only loopback hosts (localhost, 127.0.0.0/8, ::1) are allowed; set DEVDIGEST_ALLOW_REMOTE_API=1 and use https to override`,
      );
    }
    if (url.protocol !== "https:") {
      throw new ConfigError(`Invalid ${name} (${origin}): a non-loopback API requires https://`);
    }
  }
  return { apiUrl: (origin + url.pathname).replace(/\/+$/, ""), remote };
}

function readVar<T>(
  env: Record<string, string | undefined>,
  name: string,
  fallback: string,
  schema: z.ZodType<T>,
): T {
  const raw = env[name];
  const value = raw === undefined || raw.trim() === "" ? fallback : raw.trim();
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const reason = parsed.error.issues[0]?.message ?? "invalid value";
    throw new ConfigError(`Invalid ${name}=${JSON.stringify(value)}: ${reason}`);
  }
  return parsed.data;
}

export function parseConfig(env: Record<string, string | undefined>): Config {
  const rawUrl = env.DEVDIGEST_API_URL?.trim() || DEFAULT_API_URL;
  const allowRemote = env.DEVDIGEST_ALLOW_REMOTE_API?.trim() === "1";
  const { apiUrl, remote } = parseApiUrl(rawUrl, allowRemote);

  const runWaitRaw = readVar(env, "DEVDIGEST_RUN_WAIT_MS", "240000", positiveInt);
  const runWaitMs = Math.min(RUN_WAIT_MAX_MS, Math.max(RUN_WAIT_MIN_MS, runWaitRaw));

  const pollIntervalMs = readVar(env, "DEVDIGEST_POLL_INTERVAL_MS", "2000", positiveInt);
  const httpTimeoutMs = readVar(env, "DEVDIGEST_HTTP_TIMEOUT_MS", "15000", positiveInt);
  const logLevel = readVar(env, "DEVDIGEST_MCP_LOG_LEVEL", "info", z.enum(LOG_LEVELS));

  return {
    apiUrl,
    apiIsRemote: remote,
    runWaitMs,
    pollIntervalMs,
    httpTimeoutMs,
    longHttpTimeoutMs: Math.max(httpTimeoutMs, LONG_HTTP_TIMEOUT_FLOOR_MS),
    logLevel,
  };
}
