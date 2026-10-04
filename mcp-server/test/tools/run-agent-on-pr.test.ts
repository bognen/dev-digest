import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/errors.js";
import { makeRunAgentOnPrHandler } from "../../src/tools/run-agent-on-pr.js";
import {
  PULL,
  RUN_ID,
  baseRoutes,
  fakeApi,
  finding,
  jsonOf,
  makeDeps,
  review,
  runRow,
  textOf,
  virtualClock,
  type Route,
} from "../helpers/fakes.js";

const ARGS = { repo: "acme/api", pr: 42, agent: "Security" };
const POST_OK = { runs: [{ run_id: RUN_ID, agent_id: "ag-a", agent_name: "Security" }] };

function setup(extra: Record<string, Route> = {}, env: Record<string, string> = { DEVDIGEST_RUN_WAIT_MS: "10000" }) {
  const api = fakeApi({
    ...baseRoutes(),
    "GET /pulls/p1/runs/active": [],
    "POST /pulls/p1/review": POST_OK,
    "GET /pulls/p1/runs": [runRow({ status: "done" })],
    "GET /pulls/p1/reviews": [review({ findings: [finding({ id: "f9", title: "boom" })] })],
    ...extra,
  });
  const clock = virtualClock();
  const handler = makeRunAgentOnPrHandler(makeDeps(api, env, { sleep: clock.sleep, now: clock.now }));
  return { api, clock, handler };
}

describe("run_agent_on_pr", () => {
  it("happy path: starts the run, polls running->done, then fetches /reviews and returns findings", async () => {
    const { api, handler } = setup({
      "GET /pulls/p1/runs": (n: number) => [runRow({ status: n === 0 ? "running" : "done" })],
    });
    const res = await handler(ARGS);

    expect(res.isError).toBeFalsy();
    const out = jsonOf(res);
    expect(out).toMatchObject({ status: "done", run_id: RUN_ID, verdict: "comment", score: 80 });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].title).toBe("boom");
    expect(api.count("POST", "/pulls/p1/review")).toBe(1);
    expect(api.count("GET", "/pulls/p1/runs")).toBe(2);
    expect(api.count("GET", "/pulls/p1/reviews")).toBe(1);
  });

  it("resolves repo, PR and agent BEFORE the POST", async () => {
    const { api, handler } = setup();
    await handler(ARGS);
    const idx = (p: string) => api.calls.findIndex((c) => c.path === p);
    expect(idx("/agents")).toBeGreaterThanOrEqual(0);
    expect(idx("/agents")).toBeLessThan(idx("/pulls/p1/review"));
    expect(idx("/repos/r1/pulls")).toBeLessThan(idx("/pulls/p1/review"));
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({ agentId: "ag-a" });
  });

  it("reuses an active run of the same agent and does NOT POST a new review", async () => {
    const { api, handler } = setup({
      "GET /pulls/p1/runs/active": [{ run_id: RUN_ID, agent_id: "ag-a", agent_name: "Security", ran_at: null }],
    });
    const res = await handler(ARGS);
    expect(api.count("POST", "/pulls/p1/review")).toBe(0);
    expect(jsonOf(res)).toMatchObject({ status: "done", reused_active_run: true });
  });

  it("does not reuse an active run belonging to a different agent", async () => {
    const { api, handler } = setup({
      "GET /pulls/p1/runs/active": [
        { run_id: "22222222-2222-4222-8222-222222222222", agent_id: "ag-b", agent_name: "Style", ran_at: null },
      ],
    });
    await handler(ARGS);
    expect(api.count("POST", "/pulls/p1/review")).toBe(1);
  });

  it("never retries a failed POST (retry would bill twice) and surfaces an error", async () => {
    const { api, handler } = setup({
      "POST /pulls/p1/review": () => {
        throw new ApiError(500, "boom");
      },
    });
    const res = await handler(ARGS);
    expect(res.isError).toBe(true);
    expect(api.count("POST", "/pulls/p1/review")).toBe(1);
  });

  it("POST returning no runs is an error", async () => {
    const { handler } = setup({ "POST /pulls/p1/review": { runs: [] } });
    const res = await handler(ARGS);
    expect(res.isError).toBe(true);
  });

  it("failed run: isError with the run's error text", async () => {
    const { handler } = setup({
      "GET /pulls/p1/runs": [runRow({ status: "failed", error: "LLM quota exceeded" })],
    });
    const res = await handler(ARGS);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("LLM quota exceeded");
  });

  it("cancelled run: isError", async () => {
    const { handler } = setup({ "GET /pulls/p1/runs": [runRow({ status: "cancelled" })] });
    const res = await handler(ARGS);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/cancel/i);
  });

  it("deadline reached: NOT an error, status running with run_id and a get_findings hint", async () => {
    const { handler, clock } = setup({ "GET /pulls/p1/runs": [runRow({ status: "running" })] });
    const res = await handler(ARGS);
    expect(res.isError).toBeFalsy();
    const out = jsonOf(res);
    expect(out).toMatchObject({ status: "running", run_id: RUN_ID, agent: "Security" });
    expect(out.hint).toContain(RUN_ID);
    expect(out.hint).toContain("get_findings");
    // waited roughly the whole 10s budget on the virtual clock
    expect(out.waited_s).toBeGreaterThanOrEqual(10);
    expect(clock.sleeps.length).toBeGreaterThan(1);
  });

  it("run never listed until the deadline: still a non-error running result with run_id", async () => {
    const { handler } = setup({ "GET /pulls/p1/runs": [] });
    const res = await handler(ARGS);
    expect(res.isError).toBeFalsy();
    expect(jsonOf(res)).toMatchObject({ status: "running", run_id: RUN_ID });
  });

  it("review row not visible at first, then visible: retries and returns findings", async () => {
    const { api, handler, clock } = setup({
      "GET /pulls/p1/reviews": (n: number) => (n === 0 ? [] : [review({ findings: [finding()] })]),
    });
    const res = await handler(ARGS);
    expect(res.isError).toBeFalsy();
    expect(jsonOf(res).findings).toHaveLength(1);
    expect(api.count("GET", "/pulls/p1/reviews")).toBe(2);
    expect(clock.sleeps).toContain(1000);
  });

  it("review row never visible: non-error status done with a get_findings hint (3 attempts)", async () => {
    const { api, handler } = setup({ "GET /pulls/p1/reviews": [] });
    const res = await handler(ARGS);
    expect(res.isError).toBeFalsy();
    const out = jsonOf(res);
    expect(out.status).toBe("done");
    expect(out.hint).toContain("get_findings");
    expect(api.count("GET", "/pulls/p1/reviews")).toBe(3);
  });

  it("3 consecutive poll failures: lost-contact message pointing at get_findings with run_id", async () => {
    const { handler } = setup({
      "GET /pulls/p1/runs": () => {
        throw new Error("network down");
      },
    });
    const res = await handler(ARGS);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/lost contact/i);
    expect(textOf(res)).toContain("get_findings");
    expect(textOf(res)).toContain(RUN_ID);
  });

  it("two poll failures followed by success do not trigger lost contact", async () => {
    const { handler } = setup({
      "GET /pulls/p1/runs": (n: number) => {
        if (n < 2) throw new Error("blip");
        return [runRow({ status: "done" })];
      },
    });
    const res = await handler(ARGS);
    expect(res.isError).toBeFalsy();
    expect(jsonOf(res).status).toBe("done");
  });

  it("abort stops polling and never calls the cancel endpoint", async () => {
    const ctl = new AbortController();
    const { api, handler } = setup({
      "GET /pulls/p1/runs": () => {
        ctl.abort();
        return [runRow({ status: "running" })];
      },
    });
    const res = await handler(ARGS, { signal: ctl.signal });
    expect(res.isError).toBeFalsy();
    expect(api.count("GET", "/pulls/p1/runs")).toBe(1);
    expect(api.calls.some((c) => c.path.includes("cancel"))).toBe(false);
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(1); // only the initial review POST
  });

  it("invokes the progress callback while waiting when one is provided", async () => {
    const progress = vi.fn();
    const { handler } = setup({
      "GET /pulls/p1/runs": (n: number) => [runRow({ status: n < 2 ? "running" : "done" })],
    });
    await handler(ARGS, { progress });
    expect(progress).toHaveBeenCalled();
    expect(progress.mock.calls[0]![0]).toHaveProperty("progress");
  });

  it("unknown agent: leads onward to list_agents and never POSTs", async () => {
    const { api, handler } = setup();
    const res = await handler({ ...ARGS, agent: "nope" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("list_agents");
    expect(api.count("POST", "/pulls/p1/review")).toBe(0);
  });

  it("unknown repo lists known repos; unknown PR lists available PR numbers", async () => {
    const { api, handler } = setup();
    const badRepo = await handler({ ...ARGS, repo: "x/y" });
    expect(badRepo.isError).toBe(true);
    expect(textOf(badRepo)).toContain("acme/api");

    const badPr = await handler({ ...ARGS, pr: 999 });
    expect(badPr.isError).toBe(true);
    expect(textOf(badPr)).toContain(String(PULL.number));
    expect(api.count("POST", "/pulls/p1/review")).toBe(0);
  });
});

describe("run_agent_on_pr untrusted labeling", () => {
  it("done result has `untrusted` as the first key and sanitized finding text", async () => {
    const { handler } = setup({
      "GET /pulls/p1/reviews": [review({ findings: [finding({ title: "x\u{E0041}\u202Ey" })] })],
    });
    const out = jsonOf(await handler(ARGS));
    expect(Object.keys(out)[0]).toBe("untrusted");
    expect(out.findings[0].title).toBe("xy");
  });
});

describe("run_agent_on_pr single-flight", () => {
  it("two concurrent calls for the same PR+agent make exactly ONE POST; the joiner is flagged reused", async () => {
    const { api, handler } = setup();
    const [a, b] = await Promise.all([handler(ARGS), handler(ARGS)]);
    expect(api.count("POST", "/pulls/p1/review")).toBe(1);
    expect(api.count("GET", "/pulls/p1/runs/active")).toBe(1);
    const outs = [jsonOf(a), jsonOf(b)];
    expect(outs.every((o) => o.status === "done" && o.run_id === RUN_ID)).toBe(true);
    expect(outs.filter((o) => o.reused_active_run).length).toBe(1);
  });

  it("different agents on the same PR are NOT collapsed", async () => {
    const { api, handler } = setup();
    await Promise.all([handler(ARGS), handler({ ...ARGS, agent: "Style" })]);
    expect(api.count("POST", "/pulls/p1/review")).toBe(2);
  });

  it("clears the entry when the start completes (success) or fails, so later calls start again", async () => {
    let fail = true;
    const { api, handler } = setup({
      "POST /pulls/p1/review": () => {
        if (fail) throw new ApiError(500, "boom");
        return POST_OK;
      },
    });
    expect((await handler(ARGS)).isError).toBe(true);
    fail = false;
    expect((await handler(ARGS)).isError).toBeFalsy();
    expect((await handler(ARGS)).isError).toBeFalsy();
    expect(api.count("POST", "/pulls/p1/review")).toBe(3);
  });
});
