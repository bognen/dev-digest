import type { AgentPerfRow } from "@devdigest/shared";
import { AGENT_PALETTE } from "@/lib/agent-color";

export type SortKey = "agent" | "runs" | "avgCost" | "avgDuration" | "accept" | "lastRun";
export type SortDir = "asc" | "desc";
export interface SortState {
  key: SortKey;
  dir: SortDir;
}

const value = (r: AgentPerfRow, key: Exclude<SortKey, "agent" | "accept">): number | null => {
  switch (key) {
    case "runs":
      return r.runs;
    case "avgCost":
      return r.avg_cost_usd;
    case "avgDuration":
      return r.avg_duration_ms;
    case "lastRun":
      return r.last_run_at ? Date.parse(r.last_run_at) : null;
  }
};

/** 0 = rate backed by enough decisions, 1 = low sample, 2 = no rate at all. */
const acceptTier = (r: AgentPerfRow) => (r.accept_rate == null ? 2 : r.low_sample ? 1 : 0);

/**
 * Table order. Agents with no runs in the period always sink to the bottom.
 * Accept-rate sorting ranks only agents with enough decided findings against
 * each other; low-sample rates follow (sorted among themselves), then agents
 * with nothing decided. Other columns put unknown (null) values last.
 */
export function sortRows(rows: readonly AgentPerfRow[], sort: SortState): AgentPerfRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const byName = (a: AgentPerfRow, b: AgentPerfRow) => a.agent_name.localeCompare(b.agent_name);
  return [...rows].sort((a, b) => {
    const idle = Number(a.runs === 0) - Number(b.runs === 0);
    if (idle !== 0) return idle;
    if (sort.key === "agent") return sign * byName(a, b);
    if (sort.key === "accept") {
      const tier = acceptTier(a) - acceptTier(b);
      if (tier !== 0) return tier;
      const diff = (a.accept_rate ?? 0) - (b.accept_rate ?? 0);
      return sign * diff || b.decided - a.decided || byName(a, b);
    }
    const va = value(a, sort.key);
    const vb = value(b, sort.key);
    if (va == null || vb == null) return Number(va == null) - Number(vb == null) || byName(a, b);
    return sign * (va - vb) || byName(a, b);
  });
}

/** Clicking a header: same column flips direction; a new column starts descending (name: ascending). */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "agent" ? "asc" : "desc" };
}

/** Accept-rate colour: green ≥ 75 %, amber ≥ 50 %, red below; muted for low samples. */
export function acceptColor(r: Pick<AgentPerfRow, "accept_rate" | "low_sample">): string {
  if (r.accept_rate == null || r.low_sample) return "var(--text-muted)";
  return r.accept_rate >= 0.75 ? "var(--ok)" : r.accept_rate >= 0.5 ? "var(--warn)" : "var(--crit)";
}

/**
 * One distinct colour per agent for this page (table icon, tile, donut slice),
 * assigned in the server's name order — a hash colour would collide between
 * agents sharing a slice of the same donut.
 */
export function agentColorMap(rows: readonly Pick<AgentPerfRow, "agent_id">[]): Map<string, string> {
  return new Map(rows.map((r, i) => [r.agent_id, AGENT_PALETTE[i % AGENT_PALETTE.length]!]));
}
