import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
const agents = [
  { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
  { id: "a2", name: "Performance", model: "gpt-4.1", enabled: true },
];
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents }),
}));
const mutateAsync = vi.fn(({ agent_ids }: { agent_ids: string[] }) =>
  Promise.resolve({ multi_run_id: "mr1", runs: agent_ids.map((id) => ({ run_id: `run-${id}` })) }),
);
vi.mock("../../../../../../../lib/hooks/multi-agent", () => ({
  useCreateMultiRun: () => ({ mutateAsync, isPending: false }),
  useAgentEstimates: () => ({ data: { estimates: [] } }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
  push.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunReviewDropdown (smoke)", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });
});

describe("RunReviewDropdown multi-select", () => {
  it("preselects every enabled agent, toggles without closing the menu, and runs only the checked agents", async () => {
    const onRunsStarted = vi.fn();
    renderWithIntl(<RunReviewDropdown prId="pr1" onRunsStarted={onRunsStarted} />);

    fireEvent.click(screen.getByText("Run Review"));
    expect(screen.getByRole("button", { name: /run multi-agent review \(2\)/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /performance/i }));
    // Menu stays open — the agent list (and the other agent's name) is still visible.
    expect(screen.getByText("Performance")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run security/i }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agent_ids: ["a1"] });
    await waitFor(() => expect(onRunsStarted).toHaveBeenCalledWith(["run-a1"]));
    expect(push).toHaveBeenCalledWith("/multi-agent-review/mr1");
  });
});
