import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/prReview.json";

/** SPEC-06 AC-1/AC-2 (one click), AC-5 (undecided → disabled + hint), AC-6 ("Eval case ✓"). */

const mutate = vi.fn();
let sources: string[] = [];
vi.mock("@/lib/hooks/eval", () => ({
  useEvalCaseSources: () => ({ data: sources }),
  useCreateCaseFromFinding: () => ({ mutate, isPending: false }),
}));

import { EvalCaseButton } from "./EvalCaseButton";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  sources = [];
});

const F: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  rationale: "r",
  suggestion: null,
  confidence: 0.98,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

const renderBtn = (f: FindingRecord) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <EvalCaseButton f={f} />
    </NextIntlClientProvider>,
  );

describe("EvalCaseButton", () => {
  it("is disabled with a hint until the finding is accepted or dismissed (AC-5)", () => {
    renderBtn(F);
    const btn = screen.getByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Accept or dismiss the finding first");
  });

  it.each([
    ["accepted", { accepted_at: "2026-10-01T00:00:00Z" }],
    ["dismissed", { dismissed_at: "2026-10-01T00:00:00Z" }],
  ])("creates a case from a %s finding in one click (AC-1/AC-2)", (_, decision) => {
    renderBtn({ ...F, ...decision });
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(mutate).toHaveBeenCalledWith("f1", expect.any(Object));
  });

  it("reads “Eval case ✓” once a case exists for the finding (AC-6)", () => {
    sources = ["f1"];
    renderBtn({ ...F, accepted_at: "2026-10-01T00:00:00Z" });
    expect(screen.getByRole("button", { name: "Eval case ✓" })).toBeInTheDocument();
  });
});
