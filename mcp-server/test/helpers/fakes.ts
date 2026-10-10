import { parseConfig, type Config } from "../../src/config.js";
import { silentLogger } from "../../src/log.js";
import type { ApiClient, RequestOptions } from "../../src/ports.js";
import type { ToolDeps } from "../../src/tools/types.js";

/** Route value: static JSON, or a function of the 0-based call count for that route (may throw). */
export type Route = unknown | ((n: number, body?: unknown) => unknown);

export interface Call {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  opts?: RequestOptions;
}

export interface FakeApi extends ApiClient {
  calls: Call[];
  count(method: "GET" | "POST", path: string): number;
}

/** Routes keyed "GET /agents" / "POST /pulls/p1/review". Unrouted paths throw so tests notice. */
export function fakeApi(routes: Record<string, Route>): FakeApi {
  const calls: Call[] = [];
  const seen = new Map<string, number>();
  const serve = async (method: "GET" | "POST", path: string, body: unknown, opts?: RequestOptions) => {
    calls.push({ method, path, ...(body !== undefined ? { body } : {}), ...(opts ? { opts } : {}) });
    const key = `${method} ${path}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (!(key in routes)) throw new Error(`fakeApi: unrouted ${key}`);
    const r = routes[key];
    return typeof r === "function" ? (r as (n: number, b?: unknown) => unknown)(n, body) : r;
  };
  return {
    calls,
    count: (method, path) => calls.filter((c) => c.method === method && c.path === path).length,
    get: (path, opts) => serve("GET", path, undefined, opts),
    post: (path, body, opts) => serve("POST", path, body, opts),
  };
}

export interface VirtualClock {
  now: () => number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  sleeps: number[];
}

/** Deterministic clock: sleep() advances time instantly; nothing really waits. */
export function virtualClock(): VirtualClock {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleeps,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
  };
}

export function makeDeps(
  api: ApiClient,
  env: Record<string, string> = {},
  extra: Partial<ToolDeps> = {},
): ToolDeps & { config: Config } {
  const clock = virtualClock();
  return { api, config: parseConfig(env), logger: silentLogger, sleep: clock.sleep, now: clock.now, ...extra };
}

export const textOf = (res: { content: unknown }): string => (res.content as { text: string }[])[0]!.text;
export const jsonOf = (res: { content: unknown }): any => JSON.parse(textOf(res));

// ---- fixtures ----
export const REPO = { id: "r1", owner: "acme", name: "api", full_name: "acme/api" };
export const PULL = { id: "p1", number: 42, title: "T" };
export const AGENT_A = { id: "ag-a", name: "Security", description: "d", provider: "anthropic", model: "m", enabled: true };
export const AGENT_B = { id: "ag-b", name: "Style", description: "d", provider: "anthropic", model: "m", enabled: true };
export const RUN_ID = "11111111-1111-4111-8111-111111111111";

export function finding(over: Record<string, unknown> = {}) {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "why",
    suggestion: null,
    dismissed_at: null,
    ...over,
  };
}

export function review(over: Record<string, unknown> = {}) {
  return {
    id: "rv1",
    agent_id: "ag-a",
    run_id: RUN_ID,
    agent_name: "Security",
    kind: "review",
    verdict: "comment",
    score: 80,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...over,
  };
}

export function runRow(over: Record<string, unknown> = {}) {
  return {
    run_id: RUN_ID,
    agent_id: "ag-a",
    agent_name: "Security",
    status: "running",
    error: null,
    score: null,
    findings_count: null,
    ran_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

/** Base routes shared by PR-scoped tools. */
export const baseRoutes = (): Record<string, Route> => ({
  "GET /repos": [REPO],
  "GET /repos/r1/pulls": [PULL],
  "GET /agents": [AGENT_A, AGENT_B],
});
