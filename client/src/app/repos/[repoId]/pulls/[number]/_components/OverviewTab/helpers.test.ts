import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import { countBlockers, isNewestRunFailed, selectLatestReview } from "./helpers";

function review(over: Partial<ReviewRecord> & { id: string }): ReviewRecord {
  return {
    pr_id: "pr1",
    agent_id: "agent-1",
    run_id: null,
    agent_name: "Agent",
    kind: "review",
    verdict: "approve",
    summary: null,
    score: 80,
    model: null,
    created_at: "2026-10-01T10:00:00.000Z",
    findings: [],
    ...over,
  } as ReviewRecord;
}

function run(over: Partial<RunSummary> & { run_id: string }): RunSummary {
  return {
    agent_id: "agent-1",
    agent_name: "Agent",
    provider: null,
    model: null,
    status: "done",
    error: null,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    findings_count: null,
    grounding: null,
    ran_at: "2026-10-01T10:00:00.000Z",
    score: null,
    blockers: null,
    cost_usd: null,
    ...over,
  } as RunSummary;
}

function finding(over: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

describe("selectLatestReview", () => {
  it("AC-17: picks the newest kind=review with a verdict across agents, ignoring summaries and null verdicts, regardless of order", () => {
    const reviews = [
      review({ id: "old", created_at: "2026-10-01T09:00:00.000Z", agent_id: "a1" }),
      review({ id: "newest-summary", kind: "summary", created_at: "2026-10-03T09:00:00.000Z" }),
      review({ id: "newest-null-verdict", verdict: null, created_at: "2026-10-04T09:00:00.000Z" }),
      review({ id: "winner", created_at: "2026-10-02T09:00:00.000Z", agent_id: "a2" }),
      review({ id: "mid", created_at: "2026-10-01T12:00:00.000Z", agent_id: "a3" }),
    ];
    const idsBefore = reviews.map((r) => r.id);
    expect(selectLatestReview(reviews)?.id).toBe("winner");
    // input is never mutated (no in-place sort)
    expect(reviews.map((r) => r.id)).toEqual(idsBefore);
  });

  it("EC-13: equal timestamps resolve to the first in input order", () => {
    const same = "2026-10-02T09:00:00.000Z";
    const reviews = [
      review({ id: "first", created_at: same }),
      review({ id: "second", created_at: same }),
    ];
    expect(selectLatestReview(reviews)?.id).toBe("first");
  });

  it("AC-18: empty list, or only summaries / null verdicts, gives null", () => {
    expect(selectLatestReview([])).toBeNull();
    expect(
      selectLatestReview([review({ id: "s", kind: "summary" }), review({ id: "n", verdict: null })]),
    ).toBeNull();
  });

  it("compares by parsed time, not by string order", () => {
    const reviews = [
      review({ id: "earlier", created_at: "2026-10-02T23:00:00.000Z" }),
      review({ id: "later", created_at: "2026-10-03T00:30:00+01:00" }), // = 2026-10-02T23:30Z
    ];
    expect(selectLatestReview(reviews)?.id).toBe("later");
  });
});

describe("selectLatestReview - unparseable created_at", () => {
  it("AC-17: a bad timestamp first does not block a later valid review", () => {
    expect(
      selectLatestReview([
        review({ id: "bad", created_at: "not-a-date" }),
        review({ id: "good", created_at: "2026-10-01T09:00:00.000Z" }),
      ])?.id,
    ).toBe("good");
  });

  it("AC-17: bad timestamps rank below every valid one, wherever they sit", () => {
    expect(
      selectLatestReview([
        review({ id: "old", created_at: "2026-10-01T09:00:00.000Z" }),
        review({ id: "bad", created_at: "garbage" }),
        review({ id: "new", created_at: "2026-10-02T09:00:00.000Z" }),
      ])?.id,
    ).toBe("new");
  });

  it("AC-17: with only bad timestamps the first eligible review is still returned", () => {
    expect(
      selectLatestReview([
        review({ id: "s", kind: "summary", created_at: "2026-10-09T09:00:00.000Z" }),
        review({ id: "b1", created_at: "nope" }),
        review({ id: "b2", created_at: "also-nope" }),
      ])?.id,
    ).toBe("b1");
  });
});

describe("isNewestRunFailed", () => {
  it("AC-19: true only when the run with the greatest ran_at has status failed, regardless of array order", () => {
    const runs = [
      run({ run_id: "a", ran_at: "2026-10-01T10:00:00.000Z", status: "done" }),
      run({ run_id: "b", ran_at: "2026-10-03T10:00:00.000Z", status: "failed" }),
      run({ run_id: "c", ran_at: "2026-10-02T10:00:00.000Z", status: "done" }),
    ];
    expect(isNewestRunFailed(runs)).toBe(true);
    expect(isNewestRunFailed([...runs].reverse())).toBe(true);
  });

  it("AC-19: false when the newest run is done, cancelled or running, even if an older one failed", () => {
    for (const status of ["done", "cancelled", "running"]) {
      const runs = [
        run({ run_id: "old", ran_at: "2026-10-01T10:00:00.000Z", status: "failed" }),
        run({ run_id: "new", ran_at: "2026-10-02T10:00:00.000Z", status }),
      ];
      expect(isNewestRunFailed(runs), status).toBe(false);
    }
  });

  it("runs with a null ran_at are ignored when picking the newest", () => {
    expect(
      isNewestRunFailed([
        run({ run_id: "a", ran_at: "2026-10-01T10:00:00.000Z", status: "done" }),
        run({ run_id: "b", ran_at: null, status: "failed" }),
      ]),
    ).toBe(false);
    expect(isNewestRunFailed([run({ run_id: "b", ran_at: null, status: "failed" })])).toBe(false);
  });

  // EXPECTED-RED against current code (NaN ts from an unparseable first ran_at blocks later runs).
  it("AC-19: runs with an unparseable ran_at are ignored like null, even when first", () => {
    expect(
      isNewestRunFailed([
        run({ run_id: "bad", ran_at: "not-a-date", status: "done" }),
        run({ run_id: "new", ran_at: "2026-10-02T10:00:00.000Z", status: "failed" }),
      ]),
    ).toBe(true);
    expect(
      isNewestRunFailed([
        run({ run_id: "old", ran_at: "2026-10-01T10:00:00.000Z", status: "done" }),
        run({ run_id: "bad", ran_at: "not-a-date", status: "failed" }),
      ]),
    ).toBe(false);
  });

  it("EC-17: empty or undefined history is not a failure", () => {
    expect(isNewestRunFailed([])).toBe(false);
    expect(isNewestRunFailed(undefined)).toBe(false);
  });
});

describe("countBlockers", () => {
  it("AC-16: counts CRITICAL, not-dismissed findings only", () => {
    const findings = [
      finding({ id: "1", severity: "CRITICAL" }),
      finding({ id: "2", severity: "CRITICAL", dismissed_at: "2026-10-01T00:00:00.000Z" }),
      finding({ id: "3", severity: "WARNING" }),
      finding({ id: "4", severity: "SUGGESTION" }),
      finding({ id: "5", severity: "CRITICAL", accepted_at: "2026-10-01T00:00:00.000Z" }),
    ];
    expect(countBlockers(findings)).toBe(2);
    expect(countBlockers([])).toBe(0);
  });
});
