import { describe, it, expect } from "vitest";
import type { DownstreamImpact } from "@devdigest/shared";
import { GRAPH_ROW_HEIGHT } from "./constants";
import {
  buildGraphLayout,
  callerLabel,
  edgePath,
  isGraphEmpty,
  truncateLabel,
  type GraphSymbolInput,
} from "./helpers";

function group(
  symbol: string,
  nCallers: number,
  endpoints: string[] = [],
  crons: string[] = [],
): DownstreamImpact {
  return {
    symbol,
    callers: Array.from({ length: nCallers }, (_, i) => ({ name: `c${i}`, file: `src/f${i}.ts`, line: i + 1, rank: 1 })),
    endpoints_affected: endpoints,
    crons_affected: crons,
  } as DownstreamImpact;
}

const sym = (name: string, g?: DownstreamImpact): GraphSymbolInput => ({ key: `${name}:f.ts`, name, group: g });

describe("truncateLabel", () => {
  it("leaves short labels, and max < 1, unchanged; max 1 gives an ellipsis", () => {
    expect(truncateLabel("abc", 3)).toBe("abc");
    expect(truncateLabel("abcd", 0)).toBe("abcd");
    expect(truncateLabel("abcd", -2)).toBe("abcd");
    expect(truncateLabel("abcd", 1)).toBe("…");
  });

  it("cuts with an ellipsis keeping the head by default or the tail on request, within max length", () => {
    expect(truncateLabel("abcdefgh", 5)).toBe("abcd…");
    expect(truncateLabel("src/a/file.ts", 8, "end")).toBe("…file.ts");
    expect(truncateLabel("abcdefgh", 5, "end")).toHaveLength(5);
  });
});

describe("callerLabel / edgePath", () => {
  it("formats file:line and a cubic path with the midpoint x as control x", () => {
    expect(callerLabel({ file: "src/a.ts", line: 7 })).toBe("src/a.ts:7");
    expect(edgePath({ x1: 0, y1: 10, x2: 100, y2: 50 })).toBe("M 0 10 C 50 10, 50 50, 100 50");
  });
});

describe("isGraphEmpty", () => {
  it("is true unless some symbol has a group with callers", () => {
    expect(isGraphEmpty([])).toBe(true);
    expect(isGraphEmpty([sym("a"), sym("b", group("b", 0, ["GET /x"]))])).toBe(true);
    expect(isGraphEmpty([sym("a"), sym("b", group("b", 1))])).toBe(false);
  });
});

describe("buildGraphLayout", () => {
  it("skips symbols without callers", () => {
    const l = buildGraphLayout([sym("a"), sym("b", group("b", 0)), sym("c", group("c", 2))], 5);
    expect(l.symbols.map((n) => n.label)).toEqual(["c"]);
    expect(l.callers).toHaveLength(2);
  });

  it("adds a more node only above the cap, with the right hidden count", () => {
    const exact = buildGraphLayout([sym("a", group("a", 5))], 5);
    expect(exact.more).toHaveLength(0);
    expect(exact.callers).toHaveLength(5);

    const over = buildGraphLayout([sym("a", group("a", 8))], 5);
    expect(over.callers).toHaveLength(5);
    expect(over.more).toHaveLength(1);
    expect(over.more[0]!.hidden).toBe(3);
    // 5 caller edges + 1 more edge
    expect(over.edges).toHaveLength(6);
  });

  it("clamps maxCallers to at least 1 and floors fractions", () => {
    const zero = buildGraphLayout([sym("a", group("a", 3))], 0);
    expect(zero.callers).toHaveLength(1);
    expect(zero.more[0]!.hidden).toBe(2);

    const neg = buildGraphLayout([sym("a", group("a", 3))], -4);
    expect(neg.callers).toHaveLength(1);

    const frac = buildGraphLayout([sym("a", group("a", 5))], 2.9);
    expect(frac.callers).toHaveLength(2);
    expect(frac.more[0]!.hidden).toBe(3);
  });

  it("dedupes targets by kind+label, spaces them >= row height, and counts one edge per pair", () => {
    const l = buildGraphLayout(
      [
        sym("a", group("a", 1, ["GET /x", "GET /y"], ["job"])),
        sym("b", group("b", 1, ["GET /x"], ["job"])),
      ],
      5,
    );
    // GET /x, GET /y, job (shared by both symbols)
    expect(l.targets).toHaveLength(3);
    expect(l.targets.filter((t) => t.kind === "endpoint").map((t) => t.label).sort()).toEqual(["GET /x", "GET /y"]);
    expect(l.targets.filter((t) => t.kind === "cron").map((t) => t.label)).toEqual(["job"]);

    const ys = l.targets.map((t) => t.y).sort((p, q) => p - q);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(GRAPH_ROW_HEIGHT);

    // callers (2) + (a: 3 targets) + (b: 2 targets)
    expect(l.edges).toHaveLength(2 + 3 + 2);
  });

  it("treats an endpoint and a cron with the same label as distinct targets", () => {
    const l = buildGraphLayout([sym("a", group("a", 1, ["same"], ["same"]))], 5);
    expect(l.targets).toHaveLength(2);
  });
});
