import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefPage } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import * as toastLib from "@/lib/toast";
import { PrBriefCard } from "./PrBriefCard";

/** SPEC-04 card-level cases: AC-4 (summary above risks), AC-5/EC-1 (legacy), AC-12/13/EC-8 (missing inputs), NFR-4b. */

let pageData: BriefPage | undefined;

vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => ({ data: pageData, isLoading: false }),
  useGenerateBrief: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
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

afterEach(() => {
  cleanup();
  pageData = undefined;
});

function sentinelize(node: unknown, path: string[] = []): unknown {
  if (typeof node === "string") return `@@${path.join(".")}@@`;
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, sentinelize(v, [...path, k])]));
  }
  return node;
}

function renderCard(msgs: unknown = messages): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: msgs as typeof messages }}>
      <PrBriefCard prId="pr-1" repoFullName="acme/demo" reviewRunCount={1} />
    </NextIntlClientProvider>,
  );
}

const PAGE: BriefPage = {
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
    what: "Card what text.",
    why: "Card why text.",
    risk_level: "medium",
    risks: [
      {
        kind: "auth_surface",
        title: "Risk title one",
        explanation: "Risk explanation one.",
        severity: "high",
        file_refs: [],
      },
    ],
    review_focus: [],
  },
};

function withBrief(o: Partial<NonNullable<BriefPage["brief"]>>): BriefPage {
  return { ...PAGE, brief: { ...PAGE.brief!, ...o } };
}

describe("PrBriefCard - summary and missing inputs (SPEC-04)", () => {
  it("AC-4: summary shown above Risk areas; what/why not rendered", () => {
    pageData = withBrief({ summary: "This PR does X because Y." });
    renderCard();

    const summary = screen.getByTestId("brief-summary");
    expect(summary).toHaveTextContent("This PR does X because Y.");
    const risksLabel = screen.getByText(messages.section.risks);
    expect(summary.compareDocumentPosition(risksLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Card what text.")).not.toBeInTheDocument();
    expect(screen.queryByText("Card why text.")).not.toBeInTheDocument();
  });

  it("AC-5/EC-1: legacy page (absent or blank summary) shows what/why and no summary element", () => {
    pageData = PAGE;
    const first = renderCard();
    expect(screen.queryByTestId("brief-summary")).toBeNull();
    expect(screen.getByText("Card what text.")).toBeInTheDocument();
    expect(screen.getByText("Card why text.")).toBeInTheDocument();
    first.unmount();

    pageData = withBrief({ summary: "   " });
    renderCard();
    expect(screen.queryByTestId("brief-summary")).toBeNull();
    expect(screen.getByText("Card what text.")).toBeInTheDocument();
    expect(screen.getByText("Card why text.")).toBeInTheDocument();
  });

  it("AC-12/EC-8/AC-13: all four missing inputs are named; [] and undefined show none; no role=status on the note", () => {
    pageData = withBrief({ summary: "S.", missing_inputs: ["intent", "blast_radius", "linked_issue", "specs"] });
    const first = renderCard();
    const note = screen.getByTestId("brief-missing-inputs");
    for (const label of Object.values(messages.missingInputs.input)) {
      expect(note).toHaveTextContent(label);
    }
    expect(note).not.toHaveAttribute("role");
    first.unmount();

    pageData = withBrief({ summary: "S.", missing_inputs: ["intent", "blast_radius", "linked_issue", "specs"] });
    const sent = renderCard(sentinelize(messages));
    expect(screen.getByTestId("brief-missing-inputs")).toHaveTextContent("@@missingInputs.statement@@");
    sent.unmount();

    for (const missing_inputs of [[], undefined] as const) {
      pageData = withBrief({ summary: "S.", missing_inputs: missing_inputs as never });
      const r = renderCard();
      expect(screen.queryByTestId("brief-missing-inputs")).toBeNull();
      r.unmount();
    }
  });

  it("NFR-4b: markup in the summary renders inert", () => {
    pageData = withBrief({ summary: "sum <img src=x onerror=alert(1)> <script>window.__pwn=1</script>" });
    const { container } = renderCard();
    expect(screen.getByTestId("brief-summary")).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img, script, [onerror]")).toBeNull();
  });
});
