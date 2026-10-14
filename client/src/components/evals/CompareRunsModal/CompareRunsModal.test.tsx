import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { EvalCaseResult } from "@devdigest/shared";
import { CONFIG, calledWith, detail, mockFetch, renderWithProviders } from "../_test/harness";
import { CompareRunsModal } from "./CompareRunsModal";

/** SPEC-06 compare: AC-29 – AC-32, AC-34, AC-65 (noise hint), NFR-7 (Esc). */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const result = (caseId: string, status: EvalCaseResult["status"]): EvalCaseResult => ({
  id: `${caseId}-${status}`,
  case_id: caseId,
  case_name: caseId === "c2" ? "missing-retry-after" : `case-${caseId}`,
  status,
  expected: { expectations: [] },
  kept: [],
  dropped: [],
  matched: [],
  unmatched: [],
  duration_ms: 1,
  cost_usd: 0.01,
  error: null,
});

const OLD_PROMPT = "You are a security-focused PR reviewer.\nReturn at most 5 findings ranked by severity.";
const V6 = detail({
  id: "r6",
  agent_version: 6,
  recall: 0.78,
  precision: 0.93,
  citation_accuracy: 0.94,
  cost_usd: 0.21,
  started_at: "2026-05-27T16:40:00.000Z",
  case_ids: ["c1", "c2", "c3"],
  config: { ...CONFIG, agent_version: 6, system_prompt: OLD_PROMPT },
  results: [result("c1", "pass"), result("c2", "pass")],
});
const V7 = detail({
  id: "r7",
  case_ids: ["c1", "c2", "c4"],
  results: [result("c1", "pass"), result("c2", "fail")],
});

function setup() {
  const fetch = mockFetch({
    "GET /eval/runs/r6": V6,
    "GET /eval/runs/r7": V7,
    "POST /eval/runs/r7/promote": { agent_id: "a1", agent_version: 8, skipped_skills: [] },
  });
  const onClose = vi.fn();
  // Selection order is new-then-old on purpose: the dialog orders by start time.
  renderWithProviders(<CompareRunsModal runIds={["r7", "r6"]} onClose={onClose} />);
  return { fetch, onClose };
}

describe("CompareRunsModal", () => {
  it("shows old → new values with signed deltas, older run first (AC-29)", async () => {
    setup();
    expect(await screen.findByText("Compare runs · v6 → v7")).toBeInTheDocument();
    expect(screen.getByText("▲ 4pt")).toBeInTheDocument();
    expect(screen.getByText("▼ 2pt")).toBeInTheDocument();
    expect(screen.getByText("▲ 1pt")).toBeInTheDocument();
    expect(screen.getByText("▲ 0.02")).toBeInTheDocument();
  });

  it("diffs the system prompt and lists flips, the case-set notice and the noise hint (AC-30/31/32/65)", async () => {
    setup();
    await screen.findByText("Compare runs · v6 → v7");
    const added = document.querySelectorAll('[data-diff="added"]');
    expect(added).toHaveLength(1);
    expect(added[0]).toHaveTextContent("Flag unused imports as suggestions.");
    expect(document.querySelectorAll('[data-diff="removed"]')).toHaveLength(0);
    expect(screen.getByText("missing-retry-after: pass → fail")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Case sets differ: +1 added, −1 removed");
    expect(screen.getByText(/sampling noise/)).toBeInTheDocument();
  });

  it("promotes the newer run after confirmation (AC-34)", async () => {
    const { fetch, onClose } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Promote v7" }));
    fireEvent.click(await screen.findByRole("button", { name: "Promote" }));
    await waitFor(() => expect(calledWith(fetch, "POST", "/eval/runs/r7/promote")).toBe(true));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("closes on Escape (NFR-7)", async () => {
    const { onClose } = setup();
    await screen.findByText("Compare runs · v6 → v7");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
