import type { LogLevel } from "./config.js";

/**
 * JSON-lines logger. Writes to stderr ONLY: stdout is the MCP stdio protocol
 * channel and any stray byte there corrupts it. Callers must never pass full
 * HTTP bodies or finding/convention text as fields; string fields are also
 * hard-capped here as a safety net.
 */

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MAX_FIELD_CHARS = 300;

export type LogSink = (line: string) => void;

const stderrSink: LogSink = (line) => {
  process.stderr.write(line + "\n");
};

function clip(value: unknown): unknown {
  if (typeof value === "string" && value.length > MAX_FIELD_CHARS) {
    return value.slice(0, MAX_FIELD_CHARS) + "...";
  }
  if (value instanceof Error) return `${value.name}: ${clip(value.message)}`;
  return value;
}

export function createLogger(
  level: LogLevel,
  sink: LogSink = stderrSink,
  now: () => Date = () => new Date(),
): Logger {
  const emit = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>): void => {
    if (RANK[lvl] < RANK[level]) return;
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields ?? {})) safe[k] = clip(v);
    sink(JSON.stringify({ ts: now().toISOString(), level: lvl, msg, ...safe }));
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
  };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
