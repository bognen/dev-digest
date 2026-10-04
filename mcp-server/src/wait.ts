import type { ApiRunSummary } from "./api-schemas.js";
import { RunLostContactError } from "./errors.js";

/**
 * Poll a run until it reaches a terminal status, the deadline passes, the
 * caller aborts, or the API stays unreachable. No I/O of its own: the runs
 * fetcher, sleep, clock and abort signal are all injected.
 *
 * Aborting stops polling only; it never cancels the server-side run.
 */

export const MAX_POLL_INTERVAL_MS = 10_000;
export const POLL_BACKOFF_FACTOR = 1.5;
export const MAX_CONSECUTIVE_POLL_FAILURES = 3;

export type WaitState = "done" | "failed" | "cancelled" | "timeout" | "aborted";

export interface WaitOutcome {
  state: WaitState;
  /** The run row at the last successful poll (absent if never seen). */
  run?: ApiRunSummary;
  waitedMs: number;
}

export interface WaitProgress {
  elapsedMs: number;
  status: string;
}

export interface WaitDeps {
  /** Fetches the PR's run history (GET /pulls/:id/runs). May throw. */
  fetchRuns: (signal?: AbortSignal) => Promise<ApiRunSummary[]>;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
  signal?: AbortSignal;
  onProgress?: (p: WaitProgress) => void;
}

export interface WaitOptions {
  runId: string;
  /** Total time budget in ms (DEVDIGEST_RUN_WAIT_MS). */
  deadlineMs: number;
  /** First sleep between polls (DEVDIGEST_POLL_INTERVAL_MS). */
  pollIntervalMs: number;
}

function isTerminal(status: string | null): status is "done" | "failed" | "cancelled" {
  return status === "done" || status === "failed" || status === "cancelled";
}

export async function waitForRun(deps: WaitDeps, opts: WaitOptions): Promise<WaitOutcome> {
  const start = deps.now();
  const deadline = start + opts.deadlineMs;
  let interval = opts.pollIntervalMs;
  let failures = 0;
  let lastRun: ApiRunSummary | undefined;

  const outcome = (state: WaitState): WaitOutcome => ({
    state,
    waitedMs: deps.now() - start,
    ...(lastRun ? { run: lastRun } : {}),
  });

  for (;;) {
    if (deps.signal?.aborted) return outcome("aborted");

    try {
      const runs = await deps.fetchRuns(deps.signal);
      failures = 0;
      // A run not listed yet (row not visible) is treated as still running.
      const run = runs.find((r) => r.run_id === opts.runId);
      if (run) lastRun = run;
      const status = run?.status ?? "running";
      if (run && isTerminal(run.status)) return outcome(run.status);
      deps.onProgress?.({ elapsedMs: deps.now() - start, status });
    } catch (err) {
      if (deps.signal?.aborted) return outcome("aborted");
      failures += 1;
      if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) throw new RunLostContactError(opts.runId);
      void err;
    }

    const remaining = deadline - deps.now();
    if (remaining <= 0) return outcome("timeout");

    await deps.sleep(Math.min(interval, remaining), deps.signal);
    interval = Math.min(Math.round(interval * POLL_BACKOFF_FACTOR), MAX_POLL_INTERVAL_MS);
  }
}
