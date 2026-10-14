import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { EvalOverview } from "@devdigest/shared";
import { calledWith, mockFetch, renderWithProviders, run } from "@/components/evals/_test/harness";

/** SPEC-06 Eval Dashboard: AC-37 (agent rows), AC-38 (recent runs), AC-40 (run all). */

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OVERVIEW: EvalOverview = {
  agents: [
    {
      agent_id: "a1",
      name: "Security Reviewer",
      model: "gpt-4.1",
      enabled: true,
      cases_total: 20,
      latest: run(),
      spark: [0.78, 0.8, 0.82],
      running: false,
    },
    { agent_id: "a2", name: "Custom Mentor", model: "gpt-4o-mini", enabled: true, cases_total: 3, latest: null, spark: [], running: false },
  ],
  recent_runs: [
    { ...run(), owner_name: "Security Reviewer" },
    { ...run({ id: "r6", agent_version: 6, recall: 0.78 }), owner_name: "Security Reviewer" },
  ],
};

describe("EvalDashboardView", () => {
  it("lists agents with last run + metrics and links to their dashboard (AC-37)", async () => {
    mockFetch({ "GET /eval/overview": OVERVIEW });
    renderWithProviders(<EvalDashboardView />);
    const link = await screen.findByRole("link", { name: "Open Security Reviewer" });
    expect(link).toHaveAttribute("href", "/evals/agents/a1");
    expect(link).toHaveTextContent("Last run v7");
    expect(link).toHaveTextContent("17/20 pass");
    expect(link).toHaveTextContent("82%");
    expect(screen.getByRole("link", { name: "Open Custom Mentor" })).toHaveTextContent("No runs yet · 3 cases");
  });

  it("shows the most recent runs across agents (AC-38)", async () => {
    mockFetch({ "GET /eval/overview": OVERVIEW });
    renderWithProviders(<EvalDashboardView />);
    await screen.findByText("RECENT EVAL RUNS · ALL AGENTS");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("v6")).toBeInTheDocument();
  });

  it("Run all agents posts /eval/run-all (AC-40)", async () => {
    const fetch = mockFetch({ "GET /eval/overview": OVERVIEW, "POST /eval/run-all": { started: [], skipped: [] } });
    renderWithProviders(<EvalDashboardView />);
    fireEvent.click(await screen.findByRole("button", { name: "Run all agents" }));
    await waitFor(() => expect(calledWith(fetch, "POST", "/eval/run-all")).toBe(true));
  });

  it("shows an empty state when no agent has cases", async () => {
    mockFetch({ "GET /eval/overview": { agents: [], recent_runs: [] } });
    renderWithProviders(<EvalDashboardView />);
    expect(await screen.findByText(/No agent has eval cases yet/)).toBeInTheDocument();
  });
});
