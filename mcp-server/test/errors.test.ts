import { describe, expect, it, vi } from "vitest";
import {
  AmbiguousMatchError,
  ApiError,
  ApiSchemaError,
  ApiUnreachableError,
  NotFoundError,
  RunLostContactError,
  ApiResponseTooLargeError,
  errorMessage,
  sanitizeText,
  safeHandler,
  textResult,
  toToolResult,
  toolError,
} from "../src/errors.js";

const ctx = { apiUrl: "http://localhost:3001" };

describe("errorMessage (plan texts, leads onward)", () => {
  it("unreachable", () => {
    expect(errorMessage(new ApiUnreachableError("http://x", "network"), ctx)).toBe(
      "DevDigest API not reachable at http://localhost:3001. Start it with ./scripts/dev.sh (API :3001) or set DEVDIGEST_API_URL.",
    );
  });

  it("429", () => {
    expect(errorMessage(new ApiError(429, "slow down"), ctx)).toBe(
      "Rate limit hit (reviews: 10/min). Wait ~60s, then retry.",
    );
  });

  it.each([400, 422])("%i -> Invalid request", (status) => {
    expect(errorMessage(new ApiError(status, "bad agentId"), ctx)).toBe("Invalid request: bad agentId.");
  });

  it("5xx", () => {
    expect(errorMessage(new ApiError(503, "db down"), ctx)).toBe(
      "DevDigest API error 503: db down. Check the API terminal logs.",
    );
  });

  it("404 from the API leads onward", () => {
    expect(errorMessage(new ApiError(404, "no such"), ctx)).toContain("list_agents");
  });

  it("schema mismatch", () => {
    expect(errorMessage(new ApiSchemaError("GET /agents"), ctx)).toBe(
      "Unexpected API response shape for GET /agents (API/MCP version mismatch?)",
    );
  });

  it("agent not found names list_agents and candidates", () => {
    const m = errorMessage(new NotFoundError("agent", "x", ["Security", "Style"]), ctx);
    expect(m).toBe("Agent 'x' not found. Call list_agents to get a valid agent (known: Security, Style).");
  });

  it("repo and PR not-found messages list candidates (max 10)", () => {
    const many = Array.from({ length: 14 }, (_, i) => `o/r${i}`);
    const repo = errorMessage(new NotFoundError("repo", "nope", many), ctx);
    expect(repo).toContain("o/r9");
    expect(repo).not.toContain("o/r10");
    expect(repo).toContain("owner/name");
    const pr = errorMessage(new NotFoundError("pr", "42", ["1", "2"], "acme/api"), ctx);
    expect(pr).toBe("PR #42 not found in acme/api. Available PR numbers: 1, 2.");
  });

  it("ambiguous repo asks for owner/name", () => {
    const m = errorMessage(new AmbiguousMatchError("repo", "web", ["acme/web", "other/web"]), ctx);
    expect(m).toBe("Repo 'web' is ambiguous: acme/web, other/web. Use owner/name.");
  });

  it("lost contact points to get_findings with the run id", () => {
    const m = errorMessage(new RunLostContactError("run-9"), ctx);
    expect(m).toContain("get_findings");
    expect(m).toContain("run_id=run-9");
  });

  it("abort and unknown errors never leak details; unknown is logged via the logger", () => {
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    expect(errorMessage(abort, ctx)).toContain("Request cancelled");
    const error = vi.fn();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error };
    const m = errorMessage(new Error("secret internal path C:\\x\\y.ts"), { ...ctx, logger });
    expect(m).not.toContain("secret");
    expect(error).toHaveBeenCalledOnce();
  });

  it("caps every message at 300 chars and strips control characters from API text", () => {
    const long = errorMessage(new ApiError(500, "e".repeat(1000)), ctx);
    expect(long.length).toBeLessThanOrEqual(300);
    const ctrl = errorMessage(new ApiError(400, "line1\n\u0007line2\u001b[31m"), ctx);
    expect(ctrl).toBe("Invalid request: line1 line2[31m.");
    expect(ctrl).not.toMatch(/[\u0000-\u001f]/);
  });
});

describe("result helpers", () => {
  it("toolError / toToolResult produce isError:true single text content", () => {
    expect(toolError("boom")).toEqual({ isError: true, content: [{ type: "text", text: "boom" }] });
    const r = toToolResult(new ApiError(429, "x"), ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toHaveLength(1);
  });

  it("textResult is one compact JSON text item without isError", () => {
    const r = textResult({ a: 1, b: [2] });
    expect(r).toEqual({ content: [{ type: "text", text: '{"a":1,"b":[2]}' }] });
    expect(r.isError).toBeUndefined();
  });

  it("safeHandler converts thrown errors into isError results and passes success through", async () => {
    const ok = safeHandler(ctx, async (n: number) => textResult({ n }));
    expect(await ok(1)).toEqual(textResult({ n: 1 }));
    const bad = safeHandler(ctx, async () => {
      throw new NotFoundError("agent", "z");
    });
    const res = await bad();
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("list_agents");
  });
});

describe("sanitizeText", () => {
  it("strips controls, C1, bidi, zero-width, separators, BOM and Unicode tag characters", () => {
    const hidden = "a\u{E0041}b\u202Ec\u2067d\u200Be\u200Ff\uFEFFg\u0085h\u009Fi\u2029j\u0000k";
    expect(sanitizeText(hidden)).toBe("abcdefghijk");
  });

  it("collapses whitespace but keeps normal text", () => {
    expect(sanitizeText("  a \n\t b  ")).toBe("a b");
  });
});

describe("origin-only URL display", () => {
  it("unreachable messages (thrown and mapped) never show userinfo, path or query", () => {
    const url = "https://bob:s3cret@api.example.test:9/private?key=SECRET";
    const err = new ApiUnreachableError(url, "network");
    for (const m of [err.message, errorMessage(err, { apiUrl: url })]) {
      expect(m).not.toMatch(/bob|s3cret|private|SECRET/);
      expect(m).toContain("https://api.example.test:9");
    }
  });

  it("too-large responses map to a clear message", () => {
    expect(errorMessage(new ApiResponseTooLargeError(1000), ctx)).toMatch(/API response too large/);
  });
});
