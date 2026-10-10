import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefPage } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import * as toastLib from "@/lib/toast";
import { formatCost } from "@/lib/format";

/**
 * specs/11-why-risk-brief.md — PrBriefCard: AC-36 (section order), AC-37
 * (risk rendering), AC-38/AC-39 (review focus + click navigation), AC-41
 * (per-status rendering), AC-34 (zero risks).
 */

const mutate = vi.fn();
let pageData: BriefPage | undefined;
let mutationPending = false;
let briefLoading = false;

vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => ({ data: pageData, isLoading: briefLoading }),
  useGenerateBrief: () => ({ mutate, isPending: mutationPending }),
}));

// The Run Review dropdown pulls in agents/router/prReview messages — it has its
// own tests; here it is just a marker that the panel hosts it.
vi.mock("../RunReviewDropdown", () => ({
  RunReviewDropdown: () => <button type="button">Run Review</button>,
}));

vi.spyOn(toastLib, "useToast").mockReturnValue({
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  pageData = undefined;
  mutationPending = false;
  briefLoading = false;
});

function renderCard(
  props: { onFocusFile?: (file: string, line: number | null) => void; reviewRunCount?: number } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <PrBriefCard prId="pr-1" repoFullName="acme/demo" {...props} />
    </NextIntlClientProvider>,
  );
}

/** Risk areas + review focus live behind the panel's "Show details" toggle. */
function expandDetails() {
  fireEvent.click(screen.getByRole("button", { name: /show details/i }));
}

const GENERATED_PAGE: BriefPage = {
  status: "generated",
  reason: null,
  current_head_sha: "sha-head",
  stale_markers: [],
  provenance: {
    head_sha: "sha-head",
    generated_at: "2026-08-13T00:00:00Z",
    model: "gpt-4.1",
    provider: "openai",
    attempts: 1,
    tokens_in: 1000,
    tokens_out: 200,
    cost_usd: 0.01,
    index_sha: "idx-sha",
    index_status: "full",
    index_reason: null,
    intent_resolved_at: null,
    dropped_inputs: 0,
  },
  brief: {
    what: "Adds rate limiting to the public API.",
    why: "Prevents abuse from unauthenticated clients.",
    risk_level: "high",
    risks: [
      {
        kind: "auth_surface",
        title: "New unauthenticated endpoint",
        explanation: "The rate limiter itself has no auth check.",
        severity: "high",
        // Deliberately a DIFFERENT line than the review-focus entry below,
        // so their rendered "path:line" link text never collides.
        file_refs: ["src/middleware/ratelimit.ts:99", "src/api/public/webhooks.ts"],
      },
    ],
    review_focus: [{ file: "src/middleware/ratelimit.ts", line: 42, reason: "Core rate-limit logic." }],
  },
};

import { PrBriefCard } from "./PrBriefCard";

describe("PrBriefCard", () => {
  it("AC-41: no brief yet renders the empty state and a Generate action", () => {
    pageData = { status: "none", reason: null, brief: null, provenance: null, current_head_sha: "sha1", stale_markers: [] };
    renderCard();
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate brief/i })).toBeInTheDocument();
  });

  it("AC-36/AC-37/AC-38: renders risk level, what, why, risk areas and review focus in order, and Regenerate triggers a mutation", () => {
    pageData = GENERATED_PAGE;
    renderCard();

    expect(screen.getByText("High Risk")).toBeInTheDocument();
    expect(screen.getByText("Adds rate limiting to the public API.")).toBeInTheDocument();
    expect(screen.getByText("Prevents abuse from unauthenticated clients.")).toBeInTheDocument();
    // Risk areas + review focus are collapsed by default.
    expect(screen.queryByText("New unauthenticated endpoint")).not.toBeInTheDocument();
    expandDetails();
    expect(screen.getByText("New unauthenticated endpoint")).toBeInTheDocument();
    expect(screen.getByText(/Core rate-limit logic\./)).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /regenerate/i });
    fireEvent.click(button);
    expect(mutate).toHaveBeenCalledWith({ regenerate: true }, expect.anything());
  });

  it("AC-36 order is DOM order — risk badge, What, Why, then (expanded) Risk areas and Review focus", () => {
    pageData = GENERATED_PAGE;
    renderCard();
    expandDetails();

    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    const badge = screen.getByText("High Risk");
    const what = screen.getByText("Adds rate limiting to the public API.");
    const why = screen.getByText("Prevents abuse from unauthenticated clients.");
    const risksLabel = screen.getByText("Risk areas");
    const focusLabel = screen.getByText("Review focus");

    expect(badge.compareDocumentPosition(what) & FOLLOWING).toBeTruthy();
    expect(what.compareDocumentPosition(why) & FOLLOWING).toBeTruthy();
    expect(why.compareDocumentPosition(risksLabel) & FOLLOWING).toBeTruthy();
    expect(risksLabel.compareDocumentPosition(focusLabel) & FOLLOWING).toBeTruthy();
  });

  it("renders as one compact panel: details collapsed, a refresh action, and the Run Review dropdown", () => {
    pageData = GENERATED_PAGE;
    renderCard();
    expect(screen.getByRole("button", { name: /show details/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Review" })).toBeInTheDocument();
  });

  it('shows "Review not run yet" only while no agent run exists', () => {
    pageData = GENERATED_PAGE;
    const { unmount } = renderCard({ reviewRunCount: 0 });
    expect(screen.getByText("Review not run yet")).toBeInTheDocument();
    unmount();
    renderCard({ reviewRunCount: 2 });
    expect(screen.queryByText("Review not run yet")).not.toBeInTheDocument();
  });

  it("AC-37: expanding a risk reveals its explanation and file references, with a real host link", () => {
    pageData = GENERATED_PAGE;
    renderCard();
    expandDetails();

    const riskToggle = screen.getByRole("button", { name: /New unauthenticated endpoint/i });
    expect(riskToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(riskToggle);
    expect(screen.getByText("The rate limiter itself has no auth check.")).toBeInTheDocument();
    const link = screen.getByText("src/middleware/ratelimit.ts:99").closest("a");
    expect(link).toHaveAttribute("href", "https://github.com/acme/demo/blob/sha-head/src/middleware/ratelimit.ts#L99");
  });

  it("AC-39: activating a review-focus entry calls onFocusFile with the file and line", () => {
    pageData = GENERATED_PAGE;
    const onFocusFile = vi.fn();
    renderCard({ onFocusFile });
    expandDetails();

    fireEvent.click(screen.getByRole("button", { name: /src\/middleware\/ratelimit\.ts:42/ }));
    expect(onFocusFile).toHaveBeenCalledWith("src/middleware/ratelimit.ts", 42);
  });

  it("AC-34: zero surviving risks renders an explicit empty statement, not an empty region", () => {
    pageData = { ...GENERATED_PAGE, brief: { ...GENERATED_PAGE.brief!, risks: [] } };
    renderCard();
    expandDetails();
    expect(screen.getByText("No specific risks identified.")).toBeInTheDocument();
  });

  it("AC-25/AC-41: earlier_state names the stored sha distinctly from possibly_stale", () => {
    pageData = {
      ...GENERATED_PAGE,
      status: "earlier_state",
      stale_markers: ["head sha (this brief describes sha-head, the PR is now at sha-new)"],
    };
    renderCard();
    expect(screen.getByRole("status")).toHaveTextContent(/earlier version/i);
  });

  it("AC-42: the risk level is legible without colour alone (rendered as text, not just a coloured dot)", () => {
    pageData = GENERATED_PAGE;
    renderCard();
    // The level is a real TEXT node inside the badge, not a colour-only indicator.
    expect(screen.getByText("High Risk")).toBeInTheDocument();
  });

  it("AC-41: generating renders a distinct in-flight banner", () => {
    pageData = { status: "generating", reason: null, brief: null, provenance: null, current_head_sha: "sha1", stale_markers: [] };
    renderCard();
    expect(screen.getByRole("status")).toHaveTextContent(/generating/i);
  });

  it("AC-41/AC-30: possibly_stale names what moved, distinctly from earlier_state's wording", () => {
    pageData = { ...GENERATED_PAGE, status: "possibly_stale", stale_markers: ["repository index"] };
    renderCard();
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/out of date/i);
    expect(banner).toHaveTextContent(/repository index/i);
  });

  it("AC-41/AC-31: refused names the stated reason and renders no brief content", () => {
    pageData = {
      status: "refused",
      reason: "This pull request has no changed files to analyze.",
      brief: null,
      provenance: null,
      current_head_sha: "sha1",
      stale_markers: [],
    };
    renderCard();
    expect(screen.getByRole("status")).toHaveTextContent(/no changed files to analyze/i);
    expect(screen.queryByText(/Adds rate limiting/)).not.toBeInTheDocument();
  });

  it("AC-41/AC-28/AC-33: failed names its reason, distinctly from refused and generating", () => {
    pageData = {
      status: "failed",
      reason: "Generation failed — the previous brief, if any, is unchanged.",
      brief: null,
      provenance: null,
      current_head_sha: "sha1",
      stale_markers: [],
    };
    renderCard();
    expect(screen.getByRole("status")).toHaveTextContent(/generation failed/i);
  });

  it("2026-08-15 test-quality WARNING (80% confidence): failed status with a PREVIOUS brief still renders that brief's content alongside the failure banner", () => {
    pageData = {
      ...GENERATED_PAGE,
      status: "failed",
      reason: "The model call timed out.",
    };
    renderCard();
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/generation failed/i);
    expect(banner).toHaveTextContent(/the model call timed out/i);
    expect(screen.getByText("Adds rate limiting to the public API.")).toBeInTheDocument();
    expandDetails();
    expect(screen.getByText("New unauthenticated endpoint")).toBeInTheDocument();
  });

  it("AC-40: a <script> tag in a risk explanation renders as inert visible text, never a live element", () => {
    pageData = {
      ...GENERATED_PAGE,
      brief: {
        ...GENERATED_PAGE.brief!,
        risks: [
          {
            ...GENERATED_PAGE.brief!.risks[0]!,
            explanation: "Touches the auth middleware. <script>alert(1)</script>",
          },
        ],
      },
    };
    const { container } = renderCard();
    expandDetails();
    fireEvent.click(screen.getByRole("button", { name: /New unauthenticated endpoint/i }));

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
  });

  it("renders a skeleton while the brief page is loading, with no status banner or generate action yet", () => {
    briefLoading = true;
    pageData = undefined;
    const { container } = renderCard();

    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton")).toHaveLength(2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate brief|regenerate/i })).not.toBeInTheDocument();
  });

  it("AC-43: the provenance line shows generated-at, model and cost", () => {
    pageData = GENERATED_PAGE;
    renderCard();
    const provenance = screen.getByText((content) => content.startsWith("Generated "));
    expect(provenance).toHaveTextContent("gpt-4.1");
    expect(provenance).toHaveTextContent(formatCost(GENERATED_PAGE.provenance!.cost_usd));
    // A real timestamp was rendered, not the "unknown" placeholder.
    expect(provenance.textContent).not.toContain("Generated — ·");
  });
});
