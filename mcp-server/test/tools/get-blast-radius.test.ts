import { describe, expect, it } from "vitest";
import { MAX_RESPONSE_CHARS } from "../../src/format.js";
import { ApiError } from "../../src/errors.js";
import { makeGetBlastRadiusHandler } from "../../src/tools/get-blast-radius.js";
import { REPO, baseRoutes, fakeApi, jsonOf, makeDeps, textOf, type Route } from "../helpers/fakes.js";

const BODY = {
  status: "full",
  data: {
    changed_symbols: [
      { name: "helper", file: "src/utils/helper.ts", kind: "function" },
      { name: "alone", file: "src/utils/alone.ts", kind: "class" },
    ],
    downstream: [
      {
        symbol: "helper",
        callers: [
          { name: "handler", file: "src/api/route.ts", line: 10, rank: 5 },
          { name: "other", file: "src/api/other.ts", line: 22, rank: 3 },
        ],
        endpoints_affected: ["GET /x"],
        crons_affected: ["nightly-job"],
      },
    ],
    summary: "2 symbols · 2 callers · 1 endpoint · 1 cron",
  },
};

function setup(body: unknown | Route = BODY, extra: Record<string, Route> = {}) {
  const api = fakeApi({ ...baseRoutes(), "GET /pulls/p1/blast": body as Route, ...extra });
  return { api, handler: makeGetBlastRadiusHandler(makeDeps(api)) };
}

describe("get_blast_radius", () => {
  it("resolves repo and PR, GETs the blast endpoint only, and returns the untrusted-first payload matching the API body", async () => {
    const { api, handler } = setup();
    const res = await handler({ repo: "acme/api", pr: 42 });

    expect(res.isError).toBeFalsy();
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /repos",
      "GET /repos/r1/pulls",
      "GET /pulls/p1/blast",
    ]);
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);

    const out = jsonOf(res);
    expect(Object.keys(out)[0]).toBe("untrusted");
    expect(out).toMatchObject({ repo: "acme/api", pr: 42, status: "full" });
    expect(out.degraded_reason).toBeUndefined();
    expect(out.hint).toBeUndefined();
    expect(out.changed_symbols).toEqual(BODY.data.changed_symbols);
    expect(out.downstream).toEqual(BODY.data.downstream);
    expect(out.downstream[0].callers[0]).toEqual({ name: "handler", file: "src/api/route.ts", line: 10, rank: 5 });
    expect(out.downstream[0].endpoints_affected).toEqual(["GET /x"]);
    expect(out.downstream[0].crons_affected).toEqual(["nightly-job"]);
  });

  it("maps unknown PR / unknown repo / schema mismatch / API 404 and 500 to isError results", async () => {
    const { handler } = setup();

    const pr = await handler({ repo: "acme/api", pr: 999 });
    expect(pr.isError).toBe(true);
    expect(textOf(pr)).toMatch(/not found/i);
    expect(textOf(pr)).toContain("42");

    const repo = await handler({ repo: "nobody/nothing", pr: 42 });
    expect(repo.isError).toBe(true);
    expect(textOf(repo)).toMatch(/not found/i);
    expect(textOf(repo)).toContain(REPO.full_name);

    const bad = await setup({ status: "full", data: { changed_symbols: "nope" } }).handler({ repo: "acme/api", pr: 42 });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain("Unexpected API response shape for GET /pulls/:id/blast");

    for (const status of [404, 500]) {
      const failing = setup(() => {
        throw new ApiError(status, "boom");
      });
      const r = await failing.handler({ repo: "acme/api", pr: 42 });
      expect(r.isError, String(status)).toBe(true);
      expect(textOf(r).length).toBeGreaterThan(0);
      expect(textOf(r)).not.toMatch(/\bat .*\.ts:\d+/); // no stack traces
    }
  });

  it("degraded/partial status reports degraded_reason with a Resync hint; empty changed_symbols gets the empty hint", async () => {
    const degraded = jsonOf(
      await setup({ ...BODY, status: "partial", degradedReason: "index_partial" }).handler({ repo: "acme/api", pr: 42 }),
    );
    expect(degraded.status).toBe("partial");
    expect(degraded.degraded_reason).toBe("index_partial");
    expect(degraded.hint).toMatch(/Resync/);

    const empty = await setup({ status: "full", data: { changed_symbols: [], downstream: [] } }).handler({
      repo: "acme/api",
      pr: 42,
    });
    expect(empty.isError).toBeFalsy();
    const out = jsonOf(empty);
    expect(out.changed_symbols).toEqual([]);
    expect(out.hint).toBe("No indexed symbols in the changed files.");
    expect(out.hint).not.toMatch(/Resync/);
  });

  it("a huge payload (hundreds of symbols x 20 callers) stays within MAX_RESPONSE_CHARS, truncated, valid JSON", async () => {
    const symbols = Array.from({ length: 300 }, (_, i) => ({ name: `sym${i}`, file: `src/f${i}.ts`, kind: "function" }));
    const downstream = symbols.map((s, i) => ({
      symbol: s.name,
      callers: Array.from({ length: 20 }, (_, j) => ({ name: `caller${i}_${j}`, file: `src/c/${i}/${j}.ts`, line: j + 1, rank: j })),
      endpoints_affected: [`GET /e${i}`],
      crons_affected: [],
    }));
    const res = await setup({ status: "full", data: { changed_symbols: symbols, downstream } }).handler({
      repo: "acme/api",
      pr: 42,
    });
    const text = textOf(res);
    expect(text.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    const out = JSON.parse(text);
    expect(Object.keys(out)[0]).toBe("untrusted");
    expect(out.truncated).toBeGreaterThan(0);
    expect(out.downstream.length).toBeLessThan(300);
  });
});
