import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import { LatestReviewBanner } from "./LatestReviewBanner";

/** SPEC-03 AC-17..AC-20: latest-review banner on Overview. */

afterEach(cleanup);

const REVIEW: ReviewRecord = {
  id: "rev-1",
  pr_id: "pr-1",
  agent_id: "a-1",
  run_id: "run-1",
  agent_name: "Security Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: "Hardcoded secret introduced.",
  score: 42,
  model: null,
  created_at: "2026-10-01T10:00:00Z",
  findings: [],
};

export function renderBanner(
  props: Partial<React.ComponentProps<typeof LatestReviewBanner>> = {},
): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
      <LatestReviewBanner
        review={REVIEW}
        newestRunFailed={false}
        findingsCount={3}
        blockers={2}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("LatestReviewBanner", () => {
  it("AC-17: renders the verdict as text, score, summary and counts inside a labelled region; no failure notice", () => {
    renderBanner();
    const region = screen.getByRole("region", { name: "Latest review" });
    expect(within(region).getByText("Request changes")).toBeInTheDocument();
    expect(within(region).getByText("42")).toBeInTheDocument();
    expect(within(region).getByText("Hardcoded secret introduced.")).toBeInTheDocument();
    expect(within(region).getByText(/3 finding\(s\) · 2 blockers/)).toBeInTheDocument();
    expect(within(region).getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.queryByText(/most recent review run failed/i)).not.toBeInTheDocument();
  });

  it("AC-18: renders nothing when there is no review or it has no verdict", () => {
    const { container, unmount } = renderBanner({ review: null });
    expect(container).toBeEmptyDOMElement();
    unmount();
    const second = renderBanner({ review: { ...REVIEW, verdict: null } });
    expect(second.container).toBeEmptyDOMElement();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("AC-19: newest run failed shows the status notice above the last completed review banner", () => {
    renderBanner({ newestRunFailed: true });
    const region = screen.getByRole("region", { name: "Latest review" });
    const notice = within(region).getByRole("status");
    expect(notice).toHaveTextContent(briefMessages.banner.latestRunFailed);
    const verdict = within(region).getByText("Request changes");
    expect(notice.compareDocumentPosition(verdict) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
