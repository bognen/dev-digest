import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentStats } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import perfMessages from "../../../../../../../../messages/en/agentPerformance.json";
import { API_BASE } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/agents/a1",
  useSearchParams: () => new URLSearchParams("tab=stats&range=30d&at=2026-10-01T00:00:00.000Z"),
}));

import { StatsTab } from "./StatsTab";

const STATS: AgentStats = {
  agent_id: "a1",
  agent_name: "Security Reviewer",
  runs: 142,
  priced_runs: 141,
  unpriced_runs: 1,
  total_cost_usd: 5.68,
  avg_cost_usd: 0.0403,
  avg_duration_ms: 6200,
  accepted: 39,
  dismissed: 11,
  decided: 50,
  accept_rate: 0.78,
  low_sample: false,
  last_run_at: "2026-09-30T23:56:00.000Z",
  cost_by_model: [{ model: "gpt-4.1", runs: 142, cost_usd: 5.68 }],
  cost_by_skill: [
    { skill_id: "s1", skill_name: "owasp-top10", runs: 100, cost_usd: 4.1 },
    { skill_id: null, skill_name: null, runs: 42, cost_usd: 1.58 },
  ],
  range: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
  min_decisions: 10,
  cost_basis: "estimate",
  findings_total: 60,
  pending: 10,
  findings_by_severity: { CRITICAL: 5, WARNING: 40, SUGGESTION: 15 },
  trend: [
    { label: "2026-09-29", value: 3 },
    { label: "2026-09-30", value: 5 },
  ],
};

function stub(status: number, body: unknown) {
  const fn = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, agentPerformance: perfMessages }}>
        <StatsTab agentId="a1" agentName="Security Reviewer" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Agent StatsTab", () => {
  it("queries the agent's stats for the URL range and shows the same headline numbers as the dashboard row", async () => {
    const fn = stub(200, STATS);
    renderTab();
    expect(await screen.findByTestId("stats-runs")).toHaveTextContent("142");
    expect(fn.mock.calls[0]![0]).toBe(
      `${API_BASE}/agents/a1/stats?from=${encodeURIComponent(STATS.range.from)}&to=${encodeURIComponent(STATS.range.to)}`,
    );
    expect(screen.getByTestId("stats-total-cost")).toHaveTextContent("$5.6800");
    expect(screen.getByTestId("stats-avg-cost")).toHaveTextContent("$0.0403");
    expect(screen.getByTestId("stats-avg-duration")).toHaveTextContent("6.2s");
    expect(screen.getByTestId("stats-accept")).toHaveTextContent("78%");
    expect(screen.getByText("39 accepted of 50 decided")).toBeInTheDocument();
    expect(screen.getAllByText("DevDigest estimate").length).toBeGreaterThan(0);
    const skills = screen.getByTestId("stats-cost-by-skill");
    expect(skills).toHaveTextContent("owasp-top10100 · $4.1000");
    expect(skills).toHaveTextContent("no skill recorded42 · $1.5800");
  });

  it("links back to the dashboard on the same range", async () => {
    stub(200, STATS);
    renderTab();
    expect(await screen.findByRole("link", { name: "Compare all agents" })).toHaveAttribute(
      "href",
      "/agent-performance?range=30d&at=2026-10-01T00%3A00%3A00.000Z",
    );
  });

  it("shows a per-agent empty state when the agent has no runs in the period", async () => {
    stub(200, { ...STATS, runs: 0, priced_runs: 0, unpriced_runs: 0, total_cost_usd: 0, avg_cost_usd: null, cost_by_model: [] });
    renderTab();
    expect(await screen.findByText("No runs in this period")).toBeInTheDocument();
    expect(screen.queryByTestId("stats-runs")).not.toBeInTheDocument();
  });

  it("shows an error state instead of zeros", async () => {
    stub(500, { error: { message: "boom" } });
    renderTab();
    expect(await screen.findByText("Could not load this agent's stats.")).toBeInTheDocument();
    expect(screen.queryByTestId("stats-runs")).not.toBeInTheDocument();
  });
});
