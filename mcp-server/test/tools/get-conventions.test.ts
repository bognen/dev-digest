import { describe, expect, it } from "vitest";
import { makeGetConventionsHandler } from "../../src/tools/get-conventions.js";
import { REPO, fakeApi, jsonOf, makeDeps } from "../helpers/fakes.js";

const conv = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  category: "naming",
  rule: "rule",
  rationale: "why",
  evidence_path: "src/a.ts",
  evidence_line: 3,
  occurrences: 1,
  confidence: 0.5,
  status: "accepted",
  ...over,
});

function setup(rows: unknown[]) {
  const api = fakeApi({ "GET /repos": [REPO], "GET /repos/r1/conventions": rows });
  return { api, handler: makeGetConventionsHandler(makeDeps(api)) };
}

describe("get_conventions", () => {
  it("returns accepted only, sorted confidence desc then occurrences desc, and never calls /extract", async () => {
    const { api, handler } = setup([
      conv({ id: "1", rule: "low", confidence: 0.4, occurrences: 99 }),
      conv({ id: "2", rule: "hi-few", confidence: 0.9, occurrences: 2 }),
      conv({ id: "3", rule: "hi-many", confidence: 0.9, occurrences: 7 }),
      conv({ id: "4", rule: "pending-one", status: "pending", confidence: 1 }),
      conv({ id: "5", rule: "rejected-one", status: "rejected", confidence: 1 }),
    ]);
    const out = jsonOf(await handler({ repo: "acme/api" }));
    expect(out.conventions.map((c: { rule: string }) => c.rule)).toEqual(["hi-many", "hi-few", "low"]);
    expect(out.pending).toBe(1);
    expect(out.conventions[0].evidence).toBe("src/a.ts:3");
    expect(api.calls.every((c) => c.method === "GET")).toBe(true);
    expect(api.calls.some((c) => c.path.includes("extract"))).toBe(false);
  });

  it("category filter keeps only matching accepted conventions", async () => {
    const { handler } = setup([
      conv({ id: "1", rule: "n", category: "naming" }),
      conv({ id: "2", rule: "t", category: "testing" }),
    ]);
    const out = jsonOf(await handler({ repo: "acme/api", category: "testing" }));
    expect(out.conventions.map((c: { rule: string }) => c.rule)).toEqual(["t"]);
  });

  it("zero accepted: non-error hint that includes the pending count", async () => {
    const { handler } = setup([conv({ status: "pending" }), conv({ id: "2", status: "pending" })]);
    const res = await handler({ repo: "acme/api" });
    expect(res.isError).toBeFalsy();
    const out = jsonOf(res);
    expect(out.conventions).toEqual([]);
    expect(out.pending).toBe(2);
    expect(out.hint).toContain("2");
  });

  it("limit truncates and reports truncated; rationale capped at 200", async () => {
    const { handler } = setup([
      conv({ id: "1", rule: "a", confidence: 0.9, rationale: "r".repeat(1000) }),
      conv({ id: "2", rule: "b", confidence: 0.8 }),
    ]);
    const out = jsonOf(await handler({ repo: "acme/api", limit: 1 }));
    expect(out.conventions).toHaveLength(1);
    expect(out.truncated).toBe(1);
    expect(out.conventions[0].rationale.length).toBeLessThanOrEqual(200);
  });
});

describe("get_conventions untrusted labeling and sanitizing", () => {
  it("puts `untrusted` first and strips hidden characters from rule/evidence", async () => {
    const { handler } = setup([conv({ rule: "use\u{E0041} x\u202E", evidence_path: "src/\u200Ba.ts", rationale: "r\u2067" })]);
    const text = (await handler({ repo: "acme/api" })).content[0]!.text as string;
    const out = JSON.parse(text);
    expect(Object.keys(out)[0]).toBe("untrusted");
    expect(text).not.toMatch(/[\u{E0000}-\u{E007F}\u200B-\u200F\u202A-\u202E\u2066-\u2069]/u);
    expect(out.conventions[0]).toMatchObject({ rule: "use x", evidence: "src/a.ts:3", rationale: "r" });
  });
});
