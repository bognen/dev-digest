import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { CASES, calledWith, dashboard, mockFetch, renderWithProviders, run } from "../_test/harness";
import { EvalsPanel } from "./EvalsPanel";

/** SPEC-06 Evals tab (agent): AC-9, AC-10, AC-24, AC-33, AC-41, AC-42, AC-49, NFR-7. */

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DASH = "GET /eval/dashboard/agent/a1?days=0";
const CASES_URL = "GET /eval/cases?owner_kind=agent&owner_id=a1";

function renderPanel() {
  return renderWithProviders(<EvalsPanel ownerKind="agent" ownerId="a1" ownerName="Security Reviewer" />);
}

describe("EvalsPanel (agent Evals tab)", () => {
  it("lists cases with their three result states, tags and the passing count (AC-9, AC-10)", async () => {
    mockFetch({ [DASH]: dashboard(), [CASES_URL]: CASES });
    renderPanel();
    expect(await screen.findByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(screen.getByText("expected 1 finding, got 0")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL · security")).toBeInTheDocument();
    expect(screen.getByText("WARNING · bug")).toBeInTheDocument();
    expect(screen.getByText("empty []")).toBeInTheDocument();
    expect(screen.getByText("1 / 3 passing")).toBeInTheDocument();
  });

  it("shows the regression banner and KPI values (AC-41)", async () => {
    mockFetch({ [DASH]: dashboard(), [CASES_URL]: CASES });
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("Precision dipped 2pts on v7");
    expect(screen.getByText("RECALL")).toBeInTheDocument();
    expect(screen.getAllByText("17/20").length).toBeGreaterThanOrEqual(2); // KPI tile + history row
  });

  it("renders a vacuous metric as n/a (AC-24)", async () => {
    const latest = run({ vacuous: { recall: false, precision: true, citation_accuracy: false } });
    mockFetch({ [DASH]: dashboard({ latest, delta: null, alert: null }), [CASES_URL]: CASES });
    renderPanel();
    expect(await screen.findAllByText("n/a")).not.toHaveLength(0);
  });

  it("shows the empty state with a New case action when there are no cases (AC-10)", async () => {
    mockFetch({ [DASH]: dashboard({ latest: null, delta: null, alert: null, trend: [], history: [] }), [CASES_URL]: [] });
    renderPanel();
    expect(await screen.findByText("No eval cases yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /new eval case/i }).length).toBeGreaterThan(0);
  });

  it("enables Compare only with exactly two runs selected (AC-33)", async () => {
    const third = run({ id: "r5", agent_version: 5, started_at: "2026-05-25T11:02:00.000Z" });
    const d = dashboard();
    mockFetch({ [DASH]: { ...d, history: [...d.history, third] }, [CASES_URL]: CASES });
    renderPanel();
    const compare = await screen.findByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    expect(compare).toBeDisabled();
    fireEvent.click(boxes[1]!);
    expect(compare).toBeEnabled();
    fireEvent.click(boxes[2]!); // a third selection replaces the oldest pick — still two
    expect(screen.getAllByRole("checkbox").filter((b) => b.getAttribute("aria-checked") === "true")).toHaveLength(2);
  });

  it("disables running while a run is in progress (AC-42)", async () => {
    mockFetch({ [DASH]: dashboard({ running: run({ id: "rr", status: "running" }) }), [CASES_URL]: CASES });
    renderPanel();
    const btn = await screen.findByRole("button", { name: /running/i });
    expect(btn).toBeDisabled();
    expect(screen.queryByRole("button", { name: /run case/i })).not.toBeInTheDocument();
  });

  it("starts a full run via POST /agents/:id/eval-runs", async () => {
    const fetch = mockFetch({
      [DASH]: dashboard(),
      [CASES_URL]: CASES,
      "POST /agents/a1/eval-runs": { status: 202, body: run({ id: "new", status: "running" }) },
    });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Run all evals" }));
    await waitFor(() => expect(calledWith(fetch, "POST", "/agents/a1/eval-runs")).toBe(true));
  });

  it("gives every icon-only case action an accessible name and confirms delete (NFR-7, AC-11)", async () => {
    const fetch = mockFetch({ [DASH]: dashboard(), [CASES_URL]: CASES, "DELETE /eval/cases/c2": { ok: true } });
    renderPanel();
    const list = await screen.findByRole("list", { name: "Eval cases" });
    expect(within(list).getByRole("button", { name: "Run case stripe-key-leak" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Edit case stripe-key-leak" })).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: "Delete case missing-retry-after" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calledWith(fetch, "DELETE", "/eval/cases/c2")).toBe(true));
  });
});
