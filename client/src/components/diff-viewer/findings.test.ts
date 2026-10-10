import { describe, it, expect } from "vitest";
import { partitionFindingAnchors, topSeverity, type FindingAnchor } from "./findings";
import { parsePatch } from "./helpers";
import { keysForLine } from "./comments";

const PATCH = ["@@ -1,3 +1,3 @@", " ctx line", "-old line", "+new line", " tail"].join("\n");

function renderedKeys(patch: string): Set<string> {
  const keys = new Set<string>();
  for (const ln of parsePatch(patch)) for (const k of keysForLine(ln)) keys.add(k);
  return keys;
}

const a = (id: string, line: number, severity: FindingAnchor["severity"] = "WARNING"): FindingAnchor => ({
  id,
  line,
  severity,
});

describe("partitionFindingAnchors", () => {
  it("matches add and context lines by RIGHT:<line>; unmatched and deleted-only lines are unanchored", () => {
    // new-side lines: 1 (ctx), 2 (add), 3 (ctx); the deleted line only exists on the old side
    const { matched, unanchored } = partitionFindingAnchors(
      [a("ctx", 1), a("add", 2), a("missing", 99), a("deleted-only", 4)],
      renderedKeys(PATCH),
    );
    expect(matched.get("RIGHT:1")?.map((x) => x.id)).toEqual(["ctx"]);
    expect(matched.get("RIGHT:2")?.map((x) => x.id)).toEqual(["add"]);
    expect(unanchored.map((x) => x.id)).toEqual(["missing", "deleted-only"]);
  });

  it("groups several findings on the same line", () => {
    const { matched } = partitionFindingAnchors([a("x", 2), a("y", 2)], renderedKeys(PATCH));
    expect(matched.get("RIGHT:2")).toHaveLength(2);
  });
});

describe("topSeverity", () => {
  it("picks CRITICAL > WARNING > SUGGESTION", () => {
    expect(topSeverity([a("1", 1, "SUGGESTION"), a("2", 1, "WARNING")])).toBe("WARNING");
    expect(topSeverity([a("1", 1, "SUGGESTION"), a("2", 1, "CRITICAL"), a("3", 1, "WARNING")])).toBe("CRITICAL");
    expect(topSeverity([a("1", 1, "SUGGESTION")])).toBe("SUGGESTION");
  });
});
