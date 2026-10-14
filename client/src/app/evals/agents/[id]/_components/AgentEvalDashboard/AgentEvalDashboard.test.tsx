import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { calledWith, dashboard, mockFetch, renderWithProviders } from "@/components/evals/_test/harness";

/** SPEC-06 AC-39: per-agent dashboard — header, KPIs, trend, history, period filter (default 30 days). */

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import { AgentEvalDashboard } from "./AgentEvalDashboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENT = {
  id: "a1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "p",
  enabled: true,
  version: 7,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

function setup() {
  return mockFetch({
    "GET /agents/a1": AGENT,
    "GET /agents": [{ ...AGENT, skill_count: 0, runs: 0, accept_rate: null, avg_cost_usd: null }],
    "GET /eval/dashboard/agent/a1?days=30": dashboard(),
    "GET /eval/dashboard/agent/a1?days=7": dashboard({ history: [dashboard().history[0]!] }),
  });
}

describe("AgentEvalDashboard", () => {
  it("renders header, regression banner, KPIs, trend and history for the last 30 days", async () => {
    const fetch = setup();
    renderWithProviders(<AgentEvalDashboard agentId="a1" />);
    expect(await screen.findByRole("heading", { name: /Security Reviewer/ })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Precision dipped 2pts on v7");
    expect(screen.getByText("Metric trend")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeInTheDocument();
    expect(screen.getByText(/2 runs on the 3-case gold set/)).toBeInTheDocument();
    expect(calledWith(fetch, "GET", "/eval/dashboard/agent/a1?days=30")).toBe(true);
  });

  it("re-queries with the chosen period", async () => {
    const fetch = setup();
    renderWithProviders(<AgentEvalDashboard agentId="a1" />);
    await screen.findByRole("button", { name: "Run eval" });
    const period = screen.getAllByRole("combobox").find((el) => (el as HTMLSelectElement).value === "30")!;
    fireEvent.change(period, { target: { value: "7" } });
    await waitFor(() => expect(calledWith(fetch, "GET", "/eval/dashboard/agent/a1?days=7")).toBe(true));
  });
});
