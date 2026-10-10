import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRunSummary } from "../src/api-schemas.js";
import { RunLostContactError } from "../src/errors.js";
import { defaultSleep } from "../src/clock.js";
import { waitForRun, type WaitDeps } from "../src/wait.js";

const run = (status: string | null, runId = "r1"): ApiRunSummary => ({
  run_id: runId,
  agent_id: "a",
  agent_name: "A",
  status,
  error: null,
  score: null,
  findings_count: null,
  ran_at: null,
});

/** Fake clock: sleep advances time and records requested durations. */
function harness(fetchRuns: WaitDeps["fetchRuns"], extra: Partial<WaitDeps> = {}) {
  let t = 1_000;
  const sleeps: number[] = [];
  const deps: WaitDeps = {
    fetchRuns,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    ...extra,
  };
  return { deps, sleeps };
}

const OPTS = { runId: "r1", deadlineMs: 60_000, pollIntervalMs: 2_000 };

describe("waitForRun", () => {
  it("returns immediately on a terminal status", async () => {
    const { deps, sleeps } = harness(async () => [run("done")]);
    const out = await waitForRun(deps, OPTS);
    expect(out.state).toBe("done");
    expect(out.run?.status).toBe("done");
    expect(sleeps).toEqual([]);
  });

  it.each(["failed", "cancelled"] as const)("surfaces %s as its own state", async (status) => {
    const { deps } = harness(async () => [{ ...run(status), error: "boom" }]);
    const out = await waitForRun(deps, OPTS);
    expect(out.state).toBe(status);
    expect(out.run?.error).toBe("boom");
  });

  it("polls with 2s x1.5 backoff capped at 10s, then completes", async () => {
    let n = 0;
    const { deps, sleeps } = harness(async () => [run(++n < 8 ? "running" : "done")]);
    const out = await waitForRun(deps, { ...OPTS, deadlineMs: 600_000 });
    expect(out.state).toBe("done");
    expect(sleeps).toEqual([2000, 3000, 4500, 6750, 10_000, 10_000, 10_000]);
  });

  it("treats a run missing from the list (row not visible yet) as running", async () => {
    let n = 0;
    const { deps } = harness(async () => (++n < 3 ? [] : [run("done")]));
    expect((await waitForRun(deps, OPTS)).state).toBe("done");
  });

  it("times out at the deadline without an error, never sleeping past it", async () => {
    const progress: string[] = [];
    const { deps, sleeps } = harness(async () => [run("running")], {
      onProgress: (p) => progress.push(p.status),
    });
    const out = await waitForRun(deps, { ...OPTS, deadlineMs: 10_000 });
    expect(out.state).toBe("timeout");
    expect(out.waitedMs).toBe(10_000);
    expect(out.run?.status).toBe("running");
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.every((s) => s === "running")).toBe(true);
  });

  it("tolerates transient poll failures but throws RunLostContactError after 3 consecutive", async () => {
    let n = 0;
    const flaky = harness(async () => {
      n += 1;
      if (n <= 2) throw new Error("net");
      return [run("done")];
    });
    expect((await waitForRun(flaky.deps, OPTS)).state).toBe("done");

    const dead = harness(async () => {
      throw new Error("net");
    });
    await expect(waitForRun(dead.deps, OPTS)).rejects.toBeInstanceOf(RunLostContactError);
  });

  it("resets the failure counter after a successful poll", async () => {
    const script = ["err", "err", "ok", "err", "err", "done"];
    let i = 0;
    const { deps } = harness(async () => {
      const step = script[i++];
      if (step === "err") throw new Error("net");
      return [run(step === "ok" ? "running" : "done")];
    });
    expect((await waitForRun(deps, OPTS)).state).toBe("done");
  });

  it("returns 'aborted' when the signal fires and does not keep polling", async () => {
    const ctl = new AbortController();
    let calls = 0;
    const { deps } = harness(
      async () => {
        calls += 1;
        ctl.abort();
        return [run("running")];
      },
      { signal: ctl.signal },
    );
    const out = await waitForRun(deps, OPTS);
    expect(out.state).toBe("aborted");
    expect(calls).toBe(1);
  });

  it("returns 'aborted' (not lost-contact) when a poll fails because of the abort", async () => {
    const ctl = new AbortController();
    const { deps } = harness(
      async () => {
        ctl.abort();
        throw new Error("aborted");
      },
      { signal: ctl.signal },
    );
    expect((await waitForRun(deps, OPTS)).state).toBe("aborted");
  });
});

describe("defaultSleep (fake timers)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves after the delay", async () => {
    let done = false;
    void defaultSleep(1000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it("resolves early when aborted, and immediately if already aborted", async () => {
    const ctl = new AbortController();
    let done = false;
    void defaultSleep(60_000, ctl.signal).then(() => (done = true));
    ctl.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await expect(defaultSleep(60_000, ctl.signal)).resolves.toBeUndefined();
  });
});
