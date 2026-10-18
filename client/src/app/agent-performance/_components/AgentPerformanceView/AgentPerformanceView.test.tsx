import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentPerformance, AgentPerfRow } from "@devdigest/shared";
import perfMessages from "../../../../../messages/en/agentPerformance.json";
import { API_BASE } from "@/lib/api";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
const replace = vi.fn();
let search = new URLSearchParams("range=30d&at=2026-10-01T00:00:00.000Z");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/agent-performance",
  useSearchParams: () => search,
}));

import { AgentPerformanceView } from "./AgentPerformanceView";

const PERF_URL = `${API_BASE}/agent-performance?from=${encodeURIComponent("2026-09-01T00:00:00.000Z")}&to=${encodeURIComponent("2026-10-01T00:00:00.000Z")}`;

const row = (id: string, name: string, o: Partial<AgentPerfRow> = {}): AgentPerfRow => ({
  agent_id: id,
  agent_name: name,
  runs: 0,
  priced_runs: 0,
  unpriced_runs: 0,
  total_cost_usd: 0,
  avg_cost_usd: null,
  avg_duration_ms: null,
  accepted: 0,
  dismissed: 0,
  decided: 0,
  accept_rate: null,
  low_sample: true,
  last_run_at: null,
  cost_by_model: [],
  ...o,
});

const SEC = row("a1", "Security Reviewer", {
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
});
const MENTOR = row("a2", "Custom Mentor", {
  runs: 24,
  priced_runs: 24,
  total_cost_usd: 0.72,
  avg_cost_usd: 0.03,
  avg_duration_ms: 5000,
  accepted: 3,
  dismissed: 0,
  decided: 3,
  accept_rate: 1,
  low_sample: true,
  last_run_at: "2026-09-30T22:00:00.000Z",
  cost_by_model: [{ model: "gpt-4o-mini", runs: 24, cost_usd: 0.72 }],
});
const IDLE = row("a3", "Idle Agent");

const PERF: AgentPerformance = {
  range: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
  min_decisions: 10,
  cost_basis: "estimate",
  agent_count: 3,
  totals: { runs: 166, priced_runs: 165, unpriced_runs: 1, total_cost_usd: 6.4, accepted: 42, decided: 53, accept_rate: 42 / 53 },
  most_active: { agent_id: "a1", agent_name: "Security Reviewer", runs: 142, accept_rate: 0.78, decided: 50 },
  agents: [SEC, MENTOR, IDLE],
  cost_by_agent: [
    { agent_id: "a1", agent_name: "Security Reviewer", cost_usd: 5.68 },
    { agent_id: "a2", agent_name: "Custom Mentor", cost_usd: 0.72 },
  ],
  cost_by_model: [
    { model: "gpt-4.1", runs: 142, cost_usd: 5.68 },
    { model: "gpt-4o-mini", runs: 24, cost_usd: 0.72 },
  ],
  runs_by_day: [
    { label: "2026-09-29", value: 3 },
    { label: "2026-09-30", value: 5 },
  ],
};

type Reply = { status: number; body: unknown } | "pending";

function mockFetch(reply: Reply) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (reply === "pending") return new Promise<Response>(() => {});
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: perfMessages }}>
        <AgentPerformanceView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockReset();
  search = new URLSearchParams("range=30d&at=2026-10-01T00:00:00.000Z");
});

describe("AgentPerformanceView", () => {
  it("reads stored aggregates only: one GET for the pinned range", async () => {
    const fetchFn = mockFetch({ status: 200, body: PERF });
    renderView();
    await screen.findByTestId("total-runs");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]![0]).toBe(PERF_URL);
    expect(fetchFn.mock.calls[0]![1]?.method ?? "GET").toBe("GET");
  });

  it("shows totals, cost basis, accept-rate denominator and the most-active agent", async () => {
    mockFetch({ status: 200, body: PERF });
    renderView();
    expect(await screen.findByTestId("total-runs")).toHaveTextContent("166");
    expect(screen.getByTestId("total-cost")).toHaveTextContent("$6.4000");
    expect(screen.getAllByText("DevDigest estimate").length).toBeGreaterThan(0);
    expect(screen.getByText("1 run without a price — not in the total")).toBeInTheDocument();
    expect(screen.getByTestId("avg-accept")).toHaveTextContent("79%");
    expect(screen.getByTestId("accept-denominator")).toHaveTextContent("42 accepted of 53 decided");
    expect(screen.getByTestId("most-active")).toHaveTextContent("Security Reviewer");
    expect(screen.getByText("142 runs · 78% accept (50 decided)")).toBeInTheDocument();
    expect(screen.getByTestId("cost-reconcile")).toHaveTextContent("$6.4000");
  });

  it("ranks reliable accept rates above low samples and flags the small sample", async () => {
    mockFetch({ status: 200, body: PERF });
    renderView();
    await screen.findByTestId("total-runs");
    const order = screen.getAllByTestId(/^perf-row-/).map((r) => r.getAttribute("data-testid"));
    expect(order).toEqual(["perf-row-a1", "perf-row-a2", "perf-row-a3"]);
    const mentor = screen.getByTestId("perf-row-a2");
    expect(within(mentor).getByText("low sample")).toBeInTheDocument();
    expect(within(mentor).getByTestId("row-denominator")).toHaveTextContent("3/3");
    expect(within(screen.getByTestId("perf-row-a3")).getByText("No runs in this period")).toBeInTheDocument();
  });

  it("links View to the agent's Stats tab on the same range", async () => {
    mockFetch({ status: 200, body: PERF });
    renderView();
    const link = await screen.findByRole("link", { name: "View Security Reviewer stats for this period" });
    expect(link).toHaveAttribute("href", "/agents/a1?tab=stats&range=30d&at=2026-10-01T00%3A00%3A00.000Z");
  });

  it("sorts and expands rows without another request", async () => {
    const fetchFn = mockFetch({ status: 200, body: PERF });
    renderView();
    await screen.findByTestId("total-runs");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Avg cost" }));
    expect(screen.getAllByTestId(/^perf-row-/)[0]).toHaveAttribute("data-testid", "perf-row-a1");
    fireEvent.click(screen.getByRole("button", { name: "Show details for Security Reviewer" }));
    expect(screen.getByText("39 accepted · 11 dismissed")).toBeInTheDocument();
    expect(screen.getByText("141 of 142")).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("shows skeletons, not zeros, while loading", () => {
    mockFetch("pending");
    renderView();
    expect(screen.getByTestId("perf-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("total-runs")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("shows an error with retry, not zeros, when the request fails", async () => {
    mockFetch({ status: 500, body: { error: { message: "db down" } } });
    renderView();
    expect(await screen.findByText("Could not load agent performance.")).toBeInTheDocument();
    expect(screen.getByText("db down")).toBeInTheDocument();
    expect(screen.queryByTestId("total-runs")).not.toBeInTheDocument();
  });

  it("distinguishes an empty period from a workspace with no agents", async () => {
    mockFetch({
      status: 200,
      body: { ...PERF, totals: { ...PERF.totals, runs: 0 }, most_active: null, agents: [IDLE], agent_count: 1, cost_by_agent: [], cost_by_model: [] },
    });
    renderView();
    expect(await screen.findByText("No agent runs in this period")).toBeInTheDocument();
    cleanup();

    mockFetch({ status: 200, body: { ...PERF, agent_count: 0, agents: [], totals: { ...PERF.totals, runs: 0 } } });
    renderView();
    expect(await screen.findByText("No agents yet")).toBeInTheDocument();
  });

  it("does not query an invalid custom range and says why", () => {
    search = new URLSearchParams("range=custom&from=2026-09-10&to=2026-09-01");
    const fetchFn = mockFetch({ status: 200, body: PERF });
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a start date on or before the end date");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("switches the range through the URL", async () => {
    mockFetch({ status: 200, body: PERF });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    expect(replace).toHaveBeenCalledWith("/agent-performance?range=1d");
  });
});
