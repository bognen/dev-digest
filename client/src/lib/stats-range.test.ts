import { describe, it, expect } from "vitest";
import {
  defaultCustom,
  parseRangeParams,
  pinnedRangeParams,
  resolveRange,
  writeRangeParams,
} from "./stats-range";

const NOW = new Date("2026-10-17T09:30:20.000Z");

describe("resolveRange", () => {
  it("rolls 1 day / 30 days back from now, rounded up to the minute", () => {
    expect(resolveRange({ preset: "1d" }, NOW)).toEqual({
      from: "2026-10-16T09:31:00.000Z",
      to: "2026-10-17T09:31:00.000Z",
    });
    expect(resolveRange({ preset: "30d" }, NOW)?.from).toBe("2026-09-17T09:31:00.000Z");
  });

  it("anchors a preset on `at` so a pinned link reproduces the window", () => {
    const at = "2026-10-01T12:00:00.000Z";
    expect(resolveRange({ preset: "30d", at }, NOW)).toEqual({ from: "2026-09-01T12:00:00.000Z", to: at });
  });

  it("treats custom bounds as inclusive UTC days", () => {
    expect(resolveRange({ preset: "custom", from: "2026-09-01", to: "2026-09-30" }, NOW)).toEqual({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
    });
  });

  it("rejects incomplete, inverted or over-long custom ranges", () => {
    expect(resolveRange({ preset: "custom", from: "2026-09-01" }, NOW)).toBeNull();
    expect(resolveRange({ preset: "custom", from: "2026-09-02", to: "2026-09-01" }, NOW)).toBeNull();
    expect(resolveRange({ preset: "custom", from: "2024-01-01", to: "2026-01-01" }, NOW)).toBeNull();
  });
});

describe("URL params", () => {
  it("defaults to 30 days and round-trips through the URL, keeping other params", () => {
    expect(parseRangeParams(new URLSearchParams("tab=stats")).preset).toBe("30d");
    const sp = writeRangeParams(new URLSearchParams("tab=stats&at=x"), { preset: "custom", from: "2026-09-01", to: "2026-09-02" });
    expect(sp.toString()).toBe("tab=stats&range=custom&from=2026-09-01&to=2026-09-02");
    expect(parseRangeParams(sp)).toEqual({ preset: "custom", from: "2026-09-01", to: "2026-09-02", at: undefined });
  });

  it("pins a preset to the resolved end instant", () => {
    const range = resolveRange({ preset: "1d" }, NOW)!;
    const pinned = pinnedRangeParams({ preset: "1d" }, range);
    expect(resolveRange(pinned, new Date("2030-01-01T00:00:00Z"))).toEqual(range);
  });

  it("defaults a new custom range to the last 30 UTC days", () => {
    expect(defaultCustom(NOW)).toEqual({ from: "2026-09-18", to: "2026-10-17" });
  });
});
