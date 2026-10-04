import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ApiResponseTooLargeError, ApiSchemaError, ApiUnreachableError } from "../src/errors.js";
import { MAX_RESPONSE_BYTES, createHttpApiClient } from "../src/http.js";
import { parseResponse, ReposSchema } from "../src/api-schemas.js";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function client(fetchImpl: typeof fetch, defaultTimeoutMs = 15_000) {
  return createHttpApiClient({ baseUrl: "http://api.test:3001", defaultTimeoutMs, fetch: fetchImpl });
}

describe("createHttpApiClient", () => {
  it("GETs base+path with accept header and returns parsed JSON", async () => {
    const f = vi.fn(async () => json([{ a: 1 }]));
    const out = await client(f as unknown as typeof fetch).get("/repos");
    expect(out).toEqual([{ a: 1 }]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test:3001/repos");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).accept).toBe("application/json");
    expect(init.redirect).toBe("error");
  });

  it("POSTs a JSON body with content-type", async () => {
    const f = vi.fn(async () => json({ runs: [] }));
    await client(f as unknown as typeof fetch).post("/pulls/p1/review", { agentId: "a1" });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"agentId":"a1"}');
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("rejects paths that do not start with a slash", async () => {
    await expect(client(vi.fn() as unknown as typeof fetch).get("repos")).rejects.toThrow(/must start with/);
  });

  it("maps the API error envelope to ApiError (status, message, code)", async () => {
    const f = async () => json({ error: { code: "not_found", message: "Repo missing" } }, 404);
    const err = await client(f as unknown as typeof fetch).get("/repos/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, apiMessage: "Repo missing", code: "not_found" });
  });

  it("falls back to the fastify { message } shape, then to 'HTTP <status>' for non-JSON bodies", async () => {
    const a = await client((async () => json({ message: "Too Many Requests" }, 429)) as unknown as typeof fetch)
      .post("/x", {})
      .catch((e: unknown) => e);
    expect(a).toMatchObject({ status: 429, apiMessage: "Too Many Requests" });
    const b = await client((async () => new Response("<html>oops</html>", { status: 502 })) as unknown as typeof fetch)
      .get("/x")
      .catch((e: unknown) => e);
    expect(b).toMatchObject({ status: 502, apiMessage: "HTTP 502" });
  });

  it("truncates and sanitizes server error messages", async () => {
    const f = async () => json({ error: { message: "a\n\u0000" + "b".repeat(1000) } }, 500);
    const err = (await client(f as unknown as typeof fetch).get("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.apiMessage.length).toBeLessThanOrEqual(200);
    expect(err.apiMessage).not.toMatch(/[\u0000-\u001f]/);
  });

  it("maps a network failure to ApiUnreachableError", async () => {
    const f = async () => {
      throw new TypeError("fetch failed");
    };
    const err = await client(f as unknown as typeof fetch).get("/repos").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiUnreachableError);
    expect(err).toMatchObject({ baseUrl: "http://api.test:3001", reason: "network" });
  });

  it("maps a malformed 200 body to ApiSchemaError and an empty body to undefined", async () => {
    const bad = await client((async () => new Response("not json", { status: 200 })) as unknown as typeof fetch)
      .get("/repos")
      .catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(ApiSchemaError);
    const empty = await client((async () => new Response("", { status: 200 })) as unknown as typeof fetch).get("/x");
    expect(empty).toBeUndefined();
  });

  describe("response size cap", () => {
    it("rejects early on a content-length over the cap without reading the body", async () => {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      });
      const f = async () =>
        new Response(body, { status: 200, headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) } });
      const err = await client(f as unknown as typeof fetch).get("/x").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiResponseTooLargeError);
      expect(cancelled).toBe(true); // transfer dropped, never read
    });

    it("aborts a chunked body (no content-length) once the byte counter passes the cap", async () => {
      const chunk = new Uint8Array(1024 * 1024);
      let sent = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(ctl) {
          sent += 1;
          ctl.enqueue(chunk);
          if (sent > 50) ctl.close();
        },
      });
      const f = async () => new Response(body, { status: 200 });
      const err = await client(f as unknown as typeof fetch).get("/x").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiResponseTooLargeError);
      expect(sent).toBeLessThan(10); // stopped reading shortly after 5 MB
    });

    it("applies to error bodies too, and bodies at/under the cap still parse", async () => {
      const big = async () =>
        new Response(new Uint8Array(MAX_RESPONSE_BYTES + 1), { status: 500, headers: { "content-length": "" } });
      expect(await client(big as unknown as typeof fetch).get("/x").catch((e: unknown) => e)).toBeInstanceOf(
        ApiResponseTooLargeError,
      );
      const ok = async () => new Response(JSON.stringify({ pad: "x".repeat(2_000_000) }), { status: 200 });
      expect(await client(ok as unknown as typeof fetch).get("/x")).toMatchObject({ pad: expect.any(String) });
    });
  });

  describe("timeouts (fake timers)", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const hanging: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });

    it("times out after the default timeout as ApiUnreachableError(timeout)", async () => {
      const p = client(hanging, 15_000).get("/repos").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(14_999);
      let settled = false;
      void p.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const err = await p;
      expect(err).toBeInstanceOf(ApiUnreachableError);
      expect(err).toMatchObject({ reason: "timeout" });
    });

    it("honours a per-call timeout override (30s for slow PR list / review POST)", async () => {
      const p = client(hanging, 15_000).get("/repos/r/pulls", { timeoutMs: 30_000 }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(29_999);
      let settled = false;
      void p.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await p).toBeInstanceOf(ApiUnreachableError);
    });

    it("rethrows caller cancellation as an AbortError, not as 'unreachable'", async () => {
      const ctl = new AbortController();
      const p = client(hanging).get("/repos", { signal: ctl.signal }).catch((e: unknown) => e);
      ctl.abort();
      const err = await p;
      expect(err).not.toBeInstanceOf(ApiUnreachableError);
      expect((err as Error).name).toBe("AbortError");
    });
  });
});

describe("parseResponse", () => {
  it("returns typed data, stripping unknown keys, and throws ApiSchemaError with the endpoint", () => {
    const ok = parseResponse("GET /repos", ReposSchema, [
      { id: "1", owner: "o", name: "n", full_name: "o/n", extra: true },
    ]);
    expect(ok).toEqual([{ id: "1", owner: "o", name: "n", full_name: "o/n" }]);
    expect(() => parseResponse("GET /repos", ReposSchema, { not: "array" })).toThrow(ApiSchemaError);
  });
});
