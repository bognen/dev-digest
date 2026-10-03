import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import {
  filesWithFindingsCount,
  hasOpenFinding,
  latestOpenFindingsByPath,
  mergeSmartOrder,
} from "./helpers";

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: `@@ -1 +1 @@\n+${path}` });
const sf = (path: string, finding_lines: number[] = []) => ({ path, additions: 1, deletions: 0, finding_lines });
const smart = (groups: SmartDiff["groups"]): SmartDiff => ({
  groups,
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
});

const finding = (id: string, over: Partial<FindingRecord> = {}): FindingRecord => ({
  id,
  severity: "WARNING",
  category: "bug",
  title: id,
  file: "a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r",
  accepted_at: null,
  dismissed_at: null,
  ...over,
});
const review = (
  id: string,
  created_at: string,
  findings: FindingRecord[],
  over: Partial<ReviewRecord> = {},
): ReviewRecord => ({
  id,
  pr_id: "pr",
  agent_id: "agent-1",
  run_id: null,
  kind: "review",
  verdict: null,
  summary: null,
  score: null,
  model: null,
  created_at,
  findings,
  ...over,
});

describe("mergeSmartOrder", () => {
  it("takes patches from pr.files, appends unknown files to core, drops unknown smart paths, keeps empty groups", () => {
    const files = [file("a.ts"), file("b.test.ts"), file("extra.ts")];
    const groups = mergeSmartOrder(
      files,
      smart([
        { role: "core", files: [sf("a.ts", [1])] },
        { role: "tests", files: [sf("b.test.ts"), sf("ghost.ts")] },
        { role: "docs", files: [sf("gone.md")] },
      ]),
    );
    expect(groups.map((g) => g.role)).toEqual(["core", "tests", "wiring", "docs", "boilerplate"]);
    expect(groups.slice(2).every((g) => g.files.length === 0)).toBe(true);
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["a.ts", "extra.ts"]);
    expect(groups[0]!.files[0]).toBe(files[0]); // real PrFile (with patch), not the smart-diff entry
    expect(groups[1]!.files.map((f) => f.path)).toEqual(["b.test.ts"]);
  });

  it("puts unclassified files in core when the smart-diff has no core group", () => {
    const groups = mergeSmartOrder([file("x.ts"), file("y.md")], smart([{ role: "docs", files: [sf("y.md")] }]));
    expect(groups.map((g) => g.role)).toEqual(["core", "tests", "wiring", "docs", "boilerplate"]);
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["x.ts"]);
  });
});

describe("filesWithFindingsCount", () => {
  it("counts only rendered files the smart-diff flagged with finding lines", () => {
    const [core] = mergeSmartOrder(
      [file("a.ts"), file("b.ts"), file("c.ts")],
      smart([{ role: "core", files: [sf("a.ts", [3]), sf("b.ts", []), sf("c.ts", [1, 2]), sf("gone.ts", [1])] }]),
    );
    expect(filesWithFindingsCount(core!)).toBe(2);
  });
});

describe("latestOpenFindingsByPath", () => {
  it("uses only kind=review, the latest run per agent, and plain findings", () => {
    const map = latestOpenFindingsByPath([
      review("old", "2026-01-01T00:00:00Z", [finding("old-f")]),
      review("new", "2026-02-01T00:00:00Z", [
        finding("new-f"),
        finding("null-kind", { kind: null }),
        finding("trifecta", { kind: "lethal_trifecta" }),
      ]),
      review("other-agent", "2026-01-15T00:00:00Z", [finding("other-f", { file: "b.ts" })], { agent_id: "agent-2" }),
      review("summary", "2026-03-01T00:00:00Z", [finding("sum-f", { file: "c.ts" })], { kind: "summary" }),
    ]);
    expect(map.get("a.ts")!.map((f) => f.id)).toEqual(["new-f", "null-kind"]);
    expect(map.get("b.ts")!.map((f) => f.id)).toEqual(["other-f"]);
    expect(map.has("c.ts")).toBe(false);
  });

  it("keeps dismissed findings in the map but they do not count as open", () => {
    const map = latestOpenFindingsByPath([
      review("r", "2026-01-01T00:00:00Z", [finding("d", { dismissed_at: "2026-01-02T00:00:00Z" })]),
    ]);
    expect(map.get("a.ts")).toHaveLength(1);
    expect(hasOpenFinding(map.get("a.ts"))).toBe(false);
    expect(hasOpenFinding([finding("o")])).toBe(true);
    expect(hasOpenFinding(undefined)).toBe(false);
  });
});
