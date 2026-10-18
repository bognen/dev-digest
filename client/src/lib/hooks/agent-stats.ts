/* hooks/agent-stats.ts — read-only queries for the agent Stats tab and the
   Agent Performance dashboard. Both hit stored-data aggregates only (no review,
   no model call); there are deliberately no mutations here. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentPerformance, AgentStats } from "@devdigest/shared";
import type { ResolvedRange } from "../stats-range";

const rangeQs = (r: ResolvedRange) => `from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`;

/** One agent's Stats for `[from, to)`; disabled until the range is valid. */
export function useAgentStats(agentId: string | null | undefined, range: ResolvedRange | null) {
  return useQuery({
    queryKey: ["agent-stats", agentId, range?.from, range?.to],
    queryFn: () => api.get<AgentStats>(`/agents/${agentId}/stats?${rangeQs(range!)}`),
    enabled: !!agentId && !!range,
  });
}

/** All agents' performance for `[from, to)`; disabled until the range is valid. */
export function useAgentPerformance(range: ResolvedRange | null) {
  return useQuery({
    queryKey: ["agent-performance", range?.from, range?.to],
    queryFn: () => api.get<AgentPerformance>(`/agent-performance?${rangeQs(range!)}`),
    enabled: !!range,
  });
}
