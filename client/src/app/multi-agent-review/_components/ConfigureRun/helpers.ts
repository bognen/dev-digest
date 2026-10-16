import type { AgentEstimate, PrMeta } from "@devdigest/shared";

/** A PR that can be reviewed from the Configure screen: has an id and is not `stale`. */
export interface ListablePr {
  id: string;
  number: number;
  title: string;
}

/** The active repo's PRs minus `stale` ones (and any without an id), in API order. */
export function listablePrs(pulls: PrMeta[] | undefined): ListablePr[] {
  const out: ListablePr[] = [];
  for (const p of pulls ?? []) {
    if (p.status === "stale" || !p.id) continue;
    out.push({ id: p.id, number: p.number, title: p.title });
  }
  return out;
}

/** The estimate entry of an agent, or undefined when it has no history. */
export function estimateFor(
  estimates: AgentEstimate[] | undefined,
  agentId: string,
): AgentEstimate | undefined {
  return estimates?.find((e) => e.agent_id === agentId);
}

export interface EstimateTotals {
  /** Parallel fan-out: the slowest agent's median duration; null when none known. */
  durationMs: number | null;
  /** Sum of the known median costs; null when none known. */
  costUsd: number | null;
  /** Selected agents without any usable estimate (left out of the totals). */
  excludedCount: number;
}

/**
 * Total estimate for the selected agents (AC-22, AC-23). Agents with no history
 * (no entry, or both values null) are excluded and counted.
 */
export function estimateTotals(
  selectedAgentIds: string[],
  estimates: AgentEstimate[] | undefined,
): EstimateTotals {
  let durationMs: number | null = null;
  let costUsd: number | null = null;
  let excludedCount = 0;
  for (const id of selectedAgentIds) {
    const e = estimateFor(estimates, id);
    if (!e || (e.duration_ms == null && e.cost_usd == null)) {
      excludedCount++;
      continue;
    }
    if (e.duration_ms != null) durationMs = Math.max(durationMs ?? 0, e.duration_ms);
    if (e.cost_usd != null) costUsd = (costUsd ?? 0) + e.cost_usd;
  }
  return { durationMs, costUsd, excludedCount };
}
