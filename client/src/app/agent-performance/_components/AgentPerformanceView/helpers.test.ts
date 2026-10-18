import { describe, it, expect } from "vitest";
import type { AgentPerfRow } from "@devdigest/shared";
import { nextSort, sortRows } from "./helpers";

const row = (id: string, o: Partial<AgentPerfRow> = {}): AgentPerfRow => ({
  agent_id: id,
  agent_name: id,
  runs: 5,
  priced_runs: 5,
  unpriced_runs: 0,
  total_cost_usd: 0.1,
  avg_cost_usd: 0.02,
  avg_duration_ms: 1000,
  accepted: 8,
  dismissed: 2,
  decided: 10,
  accept_rate: 0.8,
  low_sample: false,
  last_run_at: "2026-10-01T00:00:00.000Z",
  cost_by_model: [],
  cost_by_skill: [],
  ...o,
});

const ids = (rows: AgentPerfRow[]) => rows.map((r) => r.agent_id);

describe("sortRows — accept rate", () => {
  const rows = [
    row("tiny", { accept_rate: 1, accepted: 2, dismissed: 0, decided: 2, low_sample: true }),
    row("good", { accept_rate: 0.8 }),
    row("idle", { runs: 0, accept_rate: null, decided: 0, low_sample: true }),
    row("none", { accept_rate: null, accepted: 0, dismissed: 0, decided: 0, low_sample: true }),
    row("ok", { accept_rate: 0.6 }),
  ];

  it("ranks agents with enough decisions first, then low samples, then no rate, then idle", () => {
    expect(ids(sortRows(rows, { key: "accept", dir: "desc" }))).toEqual(["good", "ok", "tiny", "none", "idle"]);
  });

  it("never lets a low-sample 100% outrank a reliable rate, even ascending", () => {
    expect(ids(sortRows(rows, { key: "accept", dir: "asc" }))).toEqual(["ok", "good", "tiny", "none", "idle"]);
  });
});

describe("sortRows — other columns", () => {
  it("sorts numerically with unknown values last and idle agents at the bottom", () => {
    const rows = [
      row("a", { avg_cost_usd: 0.03 }),
      row("b", { avg_cost_usd: null }),
      row("c", { avg_cost_usd: 0.01 }),
      row("z", { runs: 0, avg_cost_usd: null }),
    ];
    expect(ids(sortRows(rows, { key: "avgCost", dir: "desc" }))).toEqual(["a", "c", "b", "z"]);
    expect(ids(sortRows(rows, { key: "avgCost", dir: "asc" }))).toEqual(["c", "a", "b", "z"]);
  });

  it("does not mutate its input", () => {
    const rows = [row("b", { runs: 1 }), row("a", { runs: 2 })];
    sortRows(rows, { key: "runs", dir: "desc" });
    expect(ids(rows)).toEqual(["b", "a"]);
  });
});

describe("nextSort", () => {
  it("flips the active column and starts a new one descending (name ascending)", () => {
    expect(nextSort({ key: "accept", dir: "desc" }, "accept")).toEqual({ key: "accept", dir: "asc" });
    expect(nextSort({ key: "accept", dir: "desc" }, "runs")).toEqual({ key: "runs", dir: "desc" });
    expect(nextSort({ key: "accept", dir: "desc" }, "agent")).toEqual({ key: "agent", dir: "asc" });
  });
});
