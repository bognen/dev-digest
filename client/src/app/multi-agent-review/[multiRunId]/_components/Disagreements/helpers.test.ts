import { describe, expect, it } from "vitest";
import { groupFindings, lineGap, type GroupableChild, type GroupableFinding } from "./helpers";

let seq = 0;
function f(start: number, end: number, title: string, category = "bug"): GroupableFinding {
  seq += 1;
  return {
    id: `f${seq}`,
    severity: "CRITICAL",
    category,
    title,
    file: "ieso_zonal_demand_to_s3.py",
    start_line: start,
    end_line: end,
    confidence: 0.9,
  };
}

const child = (findings: GroupableFinding[]): GroupableChild => ({
  run_id: `r${++seq}`,
  agent_id: null,
  agent_name: null,
  status: "done",
  findings,
});

describe("lineGap", () => {
  it("is 0 for overlapping ranges and the distance otherwise", () => {
    expect(lineGap(10, 12, 12, 14)).toBe(0);
    expect(lineGap(335, 336, 339, 340)).toBe(3);
    expect(lineGap(339, 340, 319, 322)).toBe(17);
  });
});

describe("groupFindings — one defect anchored on different lines", () => {
  it("merges nearby findings with similar titles across agents (real PR #2 case)", () => {
    const groups = groupFindings([
      child([f(335, 336, "Silent exception swallow in S3 upload")]),
      child([f(319, 322, "Exception swallowed in upload_to_s3")]),
      child([f(339, 340, "Silent exception handling in S3 upload", "security")]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.map((m) => m.childIndex).sort()).toEqual([0, 1, 2]);
  });

  it("keeps nearby findings apart when their titles differ", () => {
    const groups = groupFindings([
      child([f(312, 312, "Mutable default argument for metadata parameter")]),
      child([f(319, 322, "Exception swallowed in upload_to_s3")]),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("keeps similar titles apart when they are far away", () => {
    const groups = groupFindings([
      child([f(100, 101, "Silent exception swallow in S3 upload")]),
      child([f(300, 301, "Silent exception swallow in S3 upload")]),
    ]);
    expect(groups).toHaveLength(2);
  });
});
