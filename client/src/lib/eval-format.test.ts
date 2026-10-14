import { describe, it, expect } from "vitest";
import type { EvalCaseResult, EvalConfigSnapshot } from "@devdigest/shared";
import {
  caseFlips,
  caseSetDiff,
  configChanges,
  costDeltaLabel,
  deltaLabel,
  deltaPts,
  diffToPrFiles,
  expectationSummary,
  lineDiff,
  metricText,
  orderRuns,
  pct,
} from "./eval-format";

describe("metric formatting", () => {
  it("formats percentages, deltas and cost deltas (AC-29)", () => {
    expect(pct(0.823)).toBe("82%");
    expect(pct(null)).toBe("—");
    expect(deltaLabel(deltaPts(0.78, 0.82))).toBe("▲ 4pt");
    expect(deltaLabel(deltaPts(0.93, 0.91))).toBe("▼ 2pt");
    expect(deltaLabel(0)).toBe("± 0pt");
    expect(costDeltaLabel(0.21, 0.23)).toBe("▲ 0.02");
    expect(costDeltaLabel(null, 0.23)).toBeNull();
  });

  it("shows vacuous metrics as n/a (AC-24)", () => {
    const run = {
      recall: 1,
      precision: 1,
      citation_accuracy: 0.5,
      vacuous: { recall: false, precision: true, citation_accuracy: false },
    };
    expect(metricText(run, "precision")).toBe("n/a");
    expect(metricText(run, "recall")).toBe("100%");
  });
});

describe("lineDiff (AC-30)", () => {
  it("marks exactly the added line as new", () => {
    const oldP = "You are a reviewer.\nReturn at most 5 findings.";
    const newP = "You are a reviewer.\nReturn at most 5 findings.\nFlag unused imports as suggestions.";
    const d = lineDiff(oldP, newP);
    expect(d.filter((l) => l.kind === "added").map((l) => l.text)).toEqual(["Flag unused imports as suggestions."]);
    expect(d.filter((l) => l.kind === "removed")).toHaveLength(0);
  });

  it("reports a changed line as removed + added", () => {
    const d = lineDiff("a\nb\nc", "a\nB\nc");
    expect(d).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "B" },
      { kind: "same", text: "c" },
    ]);
  });
});

describe("run comparison helpers", () => {
  const snap = (over: Partial<EvalConfigSnapshot> = {}): EvalConfigSnapshot => ({
    agent_id: "a",
    agent_name: "A",
    agent_version: 1,
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "p",
    strategy: "single-pass",
    skills: [],
    ...over,
  });

  it("lists model/strategy/skill changes only when they differ", () => {
    expect(configChanges(snap(), snap())).toEqual([]);
    expect(configChanges(snap(), snap({ model: "gpt-4o", skills: [{ id: "s", name: "x", version: 2 }] }))).toEqual([
      "model: openai/gpt-4.1 → openai/gpt-4o",
      "skills: none → x@v2",
    ]);
  });

  it("counts case-set differences (AC-32)", () => {
    expect(caseSetDiff(["1", "2", "3"], ["1", "2", "4"])).toEqual({ added: 1, removed: 1 });
  });

  it("finds per-case flips (AC-31)", () => {
    const r = (id: string, status: EvalCaseResult["status"]): EvalCaseResult => ({
      id: `r-${id}-${status}`,
      case_id: id,
      case_name: `case-${id}`,
      status,
      expected: { expectations: [] },
      kept: [],
      dropped: [],
      matched: [],
      unmatched: [],
      duration_ms: null,
      cost_usd: null,
      error: null,
    });
    expect(caseFlips([r("1", "pass"), r("2", "pass")], [r("1", "fail"), r("2", "pass")])).toEqual([
      { name: "case-1", from: "pass", to: "fail" },
    ]);
  });

  it("orders runs old → new regardless of selection order", () => {
    const a = { started_at: "2026-05-29T09:14:00Z" };
    const b = { started_at: "2026-05-27T16:40:00Z" };
    expect(orderRuns(a, b)).toEqual([b, a]);
  });
});

describe("expectationSummary (AC-9)", () => {
  it("covers must_find, must_not_flag and clean", () => {
    const e = (type: "must_find" | "must_not_flag") => ({
      id: "1",
      type,
      file: "a",
      start_line: 1,
      end_line: 1,
      severity: "CRITICAL",
      category: "security",
    });
    expect(expectationSummary({ expectations: [e("must_find")] })).toEqual({
      kind: "must_find",
      severity: "CRITICAL",
      category: "security",
    });
    expect(expectationSummary({ expectations: [e("must_not_flag")] })).toEqual({ kind: "must_not_flag" });
    expect(expectationSummary({ expectations: [] })).toEqual({ kind: "clean" });
  });
});

describe("diffToPrFiles", () => {
  it("parses git and bare diffs into per-file patches", () => {
    const raw = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,2 +1,3 @@",
      " x",
      "+y",
      "-z",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -1 +1 @@",
      "+q",
    ].join("\n");
    const files = diffToPrFiles(raw);
    expect(files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(files[0]).toMatchObject({ additions: 1, deletions: 1 });
    expect(files[0]!.patch!.startsWith("@@ -1,2 +1,3 @@")).toBe(true);
    expect(files[1]!.patch).toBe("@@ -1 +1 @@\n+q");
  });

  it("returns [] for text without hunks", () => {
    expect(diffToPrFiles("just prose")).toEqual([]);
  });
});
