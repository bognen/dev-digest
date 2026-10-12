import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/intent.json";

/**
 * Intent is generated in exactly two ways: the "Run Intent" button, or an agent
 * run. Opening the card for a PR with no intent must NOT derive one.
 */

const regenerate = vi.fn();
let intentData: unknown;
let intentLoading = false;
let intentError = false;

vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: intentData, isLoading: intentLoading, isError: intentError }),
  useRegenerateIntent: () => ({ mutate: regenerate, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  intentLoading = false;
  intentError = false;
  vi.clearAllMocks();
});

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
      <IntentCard prId="pr-1" />
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("not yet generated: shows the prompt and a Run Intent button, and derives nothing on render", () => {
    intentData = { intent: null, unavailable_reason: "not_generated" };
    renderCard();
    expect(screen.getByText("Intent not yet analysed")).toBeInTheDocument();
    expect(screen.getByText(/Run review agents to analyse the intent/)).toBeInTheDocument();
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("pressing Run Intent derives the intent", () => {
    intentData = { intent: null, unavailable_reason: "not_generated" };
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /run intent/i }));
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it("no model configured: still offers Run Intent so it can be retried once a model is set", () => {
    intentData = { intent: null, unavailable_reason: "provider_not_configured" };
    renderCard();
    expect(screen.getByText(/No model configured/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run intent/i }));
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it("an already-derived intent still offers Run Intent (re-derive on demand)", () => {
    intentData = {
      intent: {
        pr_id: "pr-1",
        intent: "Add rate limiting.",
        in_scope: ["a"],
        out_of_scope: ["b"],
        confidence: "high",
        sources: ["title", "description"],
        ticket_refs: [],
        linked_issue: null,
        stale: false,
      },
      unavailable_reason: null,
    };
    renderCard();
    expect(screen.getByText("Add rate limiting.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run intent/i }));
    expect(regenerate).toHaveBeenCalledTimes(1);
  });
});

describe("IntentCard riskAreas slot (SPEC-05)", () => {
  const slot = <div data-testid="risk-slot">risk-slot</div>;
  const record = {
    pr_id: "pr-1",
    intent: "Add rate limiting.",
    in_scope: ["alpha scope"],
    out_of_scope: ["beta scope"],
    confidence: "high",
    sources: ["title", "description"],
    ticket_refs: [],
    linked_issue: null,
    stale: false,
  };

  function renderWithSlot(node: React.ReactNode = slot) {
    return render(
      <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
        <IntentCard prId="pr-1" riskAreas={node} />
      </NextIntlClientProvider>,
    );
  }

  it("AC-5: with an intent record the slot is inside the same card, after the scope columns", () => {
    intentData = { intent: record, unavailable_reason: null };
    renderWithSlot();
    const card = screen.getByText("Add rate limiting.").parentElement as HTMLElement;
    const risk = screen.getByTestId("risk-slot");
    expect(card.contains(risk)).toBe(true);
    for (const text of ["alpha scope", "beta scope"]) {
      const col = screen.getByText(text);
      expect(col.compareDocumentPosition(risk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it.each([
    ["not_generated", "Intent not yet analysed"],
    ["provider_not_configured", "No model configured"],
    ["generation_failed", null],
  ])("AC-6: %s renders the slot in a card of its own, below the existing content", (reason, text) => {
    intentData = { intent: null, unavailable_reason: reason };
    renderWithSlot();
    const risk = screen.getByTestId("risk-slot");
    const own = risk.parentElement as HTMLElement;
    expect(own.contains(screen.getByRole("button", { name: /run intent|retry/i }))).toBe(false);
    if (text) {
      const el = screen.getByText(new RegExp(text));
      expect(own.contains(el)).toBe(false);
      expect(el.compareDocumentPosition(risk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("AC-6: loading renders the slot in its own card", () => {
    intentData = undefined;
    intentLoading = true;
    renderWithSlot();
    const risk = screen.getByTestId("risk-slot");
    expect(risk.parentElement?.contains(screen.getByText("Intent"))).toBeFalsy();
    expect(screen.getByTestId("risk-slot")).toBeInTheDocument();
  });

  it("AC-6: isError renders only the slot's own card, with no Intent label", () => {
    intentData = undefined;
    intentError = true;
    renderWithSlot();
    expect(screen.getByTestId("risk-slot")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run intent/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/intent/i, { selector: "span, div, p" })).not.toBeInTheDocument();
  });

  it("EC-1: isError without a slot still renders nothing", () => {
    intentData = undefined;
    intentError = true;
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });
});
