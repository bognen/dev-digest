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

vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ data: intentData, isLoading: false, isError: false }),
  useRegenerateIntent: () => ({ mutate: regenerate, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
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
