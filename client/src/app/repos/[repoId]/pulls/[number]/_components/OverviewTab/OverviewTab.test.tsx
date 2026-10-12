import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefPage, FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import intentMessages from "../../../../../../../../messages/en/intent.json";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import * as toastLib from "@/lib/toast";

/** SPEC-03 AC-16, AC-18..AC-20, EC-12/15/17: latest-review banner atop Overview. */

let reviewsData: ReviewRecord[] | undefined;
let runsData: RunSummary[] | undefined;
let briefPage: BriefPage | undefined;

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: reviewsData }),
  usePrRuns: () => ({ data: runsData }),
}));
vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => ({ data: briefPage, isLoading: false }),
  useGenerateBrief: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: { intent: null, unavailable_reason: "not_generated" }, isLoading: false, isError: false }),
  useRegenerateIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/blast-radius", () => ({
  useBlastRadius: () => ({ data: undefined, isLoading: true }),
}));
vi.mock("../RunReviewDropdown", () => ({
  RunReviewDropdown: () => <button type="button">Run Review</button>,
}));

vi.spyOn(toastLib, "useToast").mockReturnValue({
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
});

import { OverviewTab } from "./OverviewTab";

afterEach(() => {
  cleanup();
  reviewsData = undefined;
  runsData = undefined;
  briefPage = undefined;
});

function finding(id: string, severity: FindingRecord["severity"], dismissed: boolean): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    review_id: "x",
    accepted_at: null,
    dismissed_at: dismissed ? "2026-10-02T00:00:00Z" : null,
  } as FindingRecord;
}

function review(over: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rev",
    pr_id: "pr-1",
    agent_id: "a",
    run_id: "r",
    agent_name: "Agent A",
    kind: "review",
    verdict: "approve",
    summary: "All good.",
    score: 90,
    model: null,
    grounding: null,
    created_at: "2026-10-01T10:00:00Z",
    findings: [],
    ...over,
  };
}

function run(over: Partial<RunSummary>): RunSummary {
  return {
    run_id: "r",
    agent_id: "a",
    agent_name: "Agent A",
    provider: null,
    model: null,
    status: "done",
    error: null,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    findings_count: null,
    grounding: null,
    ran_at: "2026-10-01T10:00:00Z",
    score: null,
    blockers: null,
    cost_usd: null,
    ...over,
  };
}

const NO_BRIEF: BriefPage = {
  status: "none",
  reason: null,
  brief: null,
  provenance: null,
  current_head_sha: "sha1",
  stale_markers: [],
};

function ui(props: Partial<React.ComponentProps<typeof OverviewTab>> = {}): React.ReactElement {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{ brief: briefMessages, prReview: prReviewMessages, intent: intentMessages, blast: blastMessages }}
    >
      <OverviewTab prId="pr-1" prBody="Body text" repoFullName="acme/demo" reviewRunCount={1} {...props} />
    </NextIntlClientProvider>
  );
}

function renderOverview(props: Partial<React.ComponentProps<typeof OverviewTab>> = {}): RenderResult {
  briefPage ??= NO_BRIEF;
  return render(ui(props));
}

describe("OverviewTab latest-review banner", () => {
  it("AC-16: banner sits above the brief card and shows the latest eligible review with correct blockers", () => {
    reviewsData = [
      review({ id: "old", agent_name: "Old Agent", verdict: "approve", created_at: "2026-10-01T10:00:00Z" }),
      review({
        id: "sum",
        kind: "summary",
        agent_name: "Summary Rec",
        verdict: "comment",
        created_at: "2026-10-03T10:00:00Z",
      }),
      review({
        id: "new",
        agent_name: "New Agent",
        verdict: "request_changes",
        summary: "Needs work.",
        score: 31,
        created_at: "2026-10-02T10:00:00Z",
        findings: [
          finding("c1", "CRITICAL", false),
          finding("c2", "CRITICAL", true), // dismissed -> not a blocker
          finding("w1", "WARNING", false),
        ],
      }),
    ];
    renderOverview();
    const region = screen.getByRole("region", { name: "Latest review" });
    expect(within(region).getByText("Request changes")).toBeInTheDocument();
    expect(within(region).getByText("31")).toBeInTheDocument();
    expect(within(region).getByText("New Agent")).toBeInTheDocument();
    expect(within(region).getByText(/3 finding\(s\) · 1 blockers/)).toBeInTheDocument();
    expect(screen.queryByText("Old Agent")).not.toBeInTheDocument();
    expect(screen.queryByText("Summary Rec")).not.toBeInTheDocument();

    const briefTitle = screen.getByText("No brief yet");
    expect(region.compareDocumentPosition(briefTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC-18 / EC-12: no reviews -> no banner; brief card, grid and description still render", () => {
    reviewsData = [];
    renderOverview({ reviewRunCount: 0 });
    expect(screen.queryByRole("region", { name: "Latest review" })).not.toBeInTheDocument();
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByText("Review not run yet")).toBeInTheDocument();
    expect(screen.getByText("Intent not yet analysed")).toBeInTheDocument();
    expect(screen.getByText("Blast Radius")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
  });

  it("AC-19 / EC-17: newest run failed -> older completed review banner plus the notice", () => {
    reviewsData = [review({ agent_name: "Older Agent", verdict: "approve" })];
    runsData = [
      run({ run_id: "r1", status: "done", ran_at: "2026-10-01T10:00:00Z" }),
      run({ run_id: "r2", status: "failed", ran_at: "2026-10-05T10:00:00Z" }),
    ];
    renderOverview();
    const region = screen.getByRole("region", { name: "Latest review" });
    expect(within(region).getByText("Approve")).toBeInTheDocument();
    expect(within(region).getByText("Older Agent")).toBeInTheDocument();
    expect(within(region).getByRole("status")).toHaveTextContent(briefMessages.banner.latestRunFailed);
  });

  it("AC-20 / EC-15: when a newer review arrives the banner switches to it", () => {
    const a = review({ id: "A", agent_name: "Agent A", verdict: "approve", created_at: "2026-10-01T10:00:00Z" });
    const b = review({
      id: "B",
      agent_name: "Agent B",
      verdict: "request_changes",
      created_at: "2026-10-02T10:00:00Z",
    });
    reviewsData = [a];
    briefPage = NO_BRIEF;
    const view = render(ui());
    expect(screen.getByText("Agent A")).toBeInTheDocument();
    reviewsData = [b, a];
    view.rerender(ui());
    expect(screen.getByText("Agent B")).toBeInTheDocument();
    expect(screen.queryByText("Agent A")).not.toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
  });

  it("passes files/onFocusFile through to the brief card (review-focus click)", () => {
    reviewsData = [];
    briefPage = {
      status: "generated",
      reason: null,
      current_head_sha: "sha-head",
      stale_markers: [],
      provenance: {
        head_sha: "sha-head",
        generated_at: "2026-08-13T00:00:00Z",
        model: "m",
        provider: "openai",
        attempts: 1,
        tokens_in: 1,
        tokens_out: 1,
        cost_usd: 0.01,
        index_sha: "i",
        index_status: "full",
        index_reason: null,
        intent_resolved_at: null,
        dropped_inputs: 0,
      },
      brief: {
        what: "W",
        why: "Y",
        risk_level: "low",
        risks: [],
        review_focus: [{ file: "src/x.ts", line: 7, reason: "Check this." }],
      },
    } as BriefPage;
    const onFocusFile = vi.fn();
    renderOverview({
      onFocusFile,
      files: [{ path: "src/x.ts" }] as unknown as React.ComponentProps<typeof OverviewTab>["files"],
    });
    fireEvent.click(screen.getByText("src/x.ts:7"));
    expect(onFocusFile).toHaveBeenCalledWith("src/x.ts", 7);
  });
});
