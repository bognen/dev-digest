import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "../src/config.js";
import { createLogger } from "../src/log.js";

describe("parseConfig", () => {
  it("applies the plan defaults when env is empty", () => {
    expect(parseConfig({})).toEqual({
      apiUrl: "http://localhost:3001",
      apiIsRemote: false,
      runWaitMs: 240_000,
      pollIntervalMs: 2_000,
      httpTimeoutMs: 15_000,
      longHttpTimeoutMs: 30_000,
      logLevel: "info",
    });
  });

  it("strips trailing slashes and treats blank values as unset", () => {
    const c = parseConfig({ DEVDIGEST_API_URL: "http://127.0.0.1:8080//", DEVDIGEST_RUN_WAIT_MS: "  " });
    expect(c.apiUrl).toBe("http://127.0.0.1:8080");
    expect(c.runWaitMs).toBe(240_000);
  });

  it("clamps run wait to 10_000..600_000", () => {
    expect(parseConfig({ DEVDIGEST_RUN_WAIT_MS: "5" }).runWaitMs).toBe(10_000);
    expect(parseConfig({ DEVDIGEST_RUN_WAIT_MS: "99999999" }).runWaitMs).toBe(600_000);
    expect(parseConfig({ DEVDIGEST_RUN_WAIT_MS: "120000" }).runWaitMs).toBe(120_000);
  });

  it("long http timeout is max(http timeout, 30000)", () => {
    expect(parseConfig({ DEVDIGEST_HTTP_TIMEOUT_MS: "5000" }).longHttpTimeoutMs).toBe(30_000);
    expect(parseConfig({ DEVDIGEST_HTTP_TIMEOUT_MS: "45000" }).longHttpTimeoutMs).toBe(45_000);
  });

  it.each([
    ["DEVDIGEST_API_URL", "ftp://x.test"],
    ["DEVDIGEST_API_URL", "not a url"],
    ["DEVDIGEST_RUN_WAIT_MS", "abc"],
    ["DEVDIGEST_POLL_INTERVAL_MS", "0"],
    ["DEVDIGEST_HTTP_TIMEOUT_MS", "-5"],
    ["DEVDIGEST_MCP_LOG_LEVEL", "verbose"],
  ])("rejects invalid %s=%s with a one-line ConfigError", (name, value) => {
    let err: unknown;
    try {
      parseConfig({ [name]: value });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    const msg = (err as ConfigError).message;
    expect(msg).toContain(name);
    expect(msg).not.toContain("\n");
  });
});

describe("DEVDIGEST_API_URL hardening", () => {
  const fail = (env: Record<string, string>): string => {
    try {
      parseConfig(env);
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      return (e as ConfigError).message;
    }
    throw new Error("expected ConfigError");
  };

  it.each([
    "http://localhost:3001",
    "http://LOCALHOST:3001/",
    "http://127.0.0.1:3001",
    "http://127.5.6.7:3001",
    "http://[::1]:3001",
  ])("accepts loopback %s by default", (url) => {
    const c = parseConfig({ DEVDIGEST_API_URL: url });
    expect(c.apiIsRemote).toBe(false);
  });

  it.each(["http://example.test:3001", "https://example.test", "http://128.0.0.1:3001", "http://localhost.evil.test"])(
    "rejects non-loopback %s without DEVDIGEST_ALLOW_REMOTE_API=1",
    (url) => {
      expect(fail({ DEVDIGEST_API_URL: url })).toContain("loopback");
    },
  );

  it("non-loopback needs the opt-in AND https; marks the config remote", () => {
    expect(fail({ DEVDIGEST_API_URL: "http://example.test", DEVDIGEST_ALLOW_REMOTE_API: "1" })).toContain("https");
    expect(fail({ DEVDIGEST_API_URL: "https://example.test", DEVDIGEST_ALLOW_REMOTE_API: "true" })).toContain("loopback");
    const c = parseConfig({ DEVDIGEST_API_URL: "https://example.test/api/", DEVDIGEST_ALLOW_REMOTE_API: "1" });
    expect(c).toMatchObject({ apiUrl: "https://example.test/api", apiIsRemote: true });
  });

  it.each([
    "http://user:pw@localhost:3001",
    "http://user@localhost:3001",
    "http://localhost:3001/?token=abc",
    "http://localhost:3001/?",
    "http://localhost:3001/#frag",
  ])("always rejects userinfo/query/fragment: %s", (url) => {
    fail({ DEVDIGEST_API_URL: url, DEVDIGEST_ALLOW_REMOTE_API: "1" });
  });

  it("error text shows only the origin, never userinfo, path or query", () => {
    const msg = fail({ DEVDIGEST_API_URL: "https://bob:s3cret@example.test:9/private/path?key=SECRET" });
    expect(msg).not.toMatch(/bob|s3cret|private|SECRET|key=/);
    expect(msg).toContain("https://example.test:9");
    const bad = fail({ DEVDIGEST_API_URL: "not a url with s3cret" });
    expect(bad).not.toContain("s3cret");
  });
});

describe("createLogger", () => {
  it("emits JSON lines to the sink, filters by level and clips long strings", () => {
    const lines: string[] = [];
    const log = createLogger("warn", (l) => lines.push(l), () => new Date("2026-01-01T00:00:00Z"));
    log.info("hidden");
    log.warn("shown", { body: "x".repeat(1000), n: 1 });
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(rec).toMatchObject({ ts: "2026-01-01T00:00:00.000Z", level: "warn", msg: "shown", n: 1 });
    expect((rec.body as string).length).toBeLessThan(400);
  });
});
