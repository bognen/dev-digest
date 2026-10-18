import type { AgentPerformance, AgentStats } from '@devdigest/shared';
import { MIN_DECISIONS } from './constants.js';
import { buildAgentStats, buildPerformance } from './helpers.js';
import type { AgentStatsStore, RangeBounds } from './types.js';

/**
 * Agent stats — the per-agent Stats tab and the global Agent Performance
 * dashboard. Read-only by construction: the only dependency is the stored-data
 * store, so neither endpoint can trigger a review or a model call.
 */
export class AgentStatsService {
  constructor(private store: AgentStatsStore) {}

  /** One agent's stats for the range; null when the agent is not in the workspace. */
  async agentStats(workspaceId: string, agentId: string, range: RangeBounds): Promise<AgentStats | null> {
    const [agent] = await this.store.agents(workspaceId, agentId);
    if (!agent) return null;
    const ids = [agent.id];
    const [runs, decisions, days] = await Promise.all([
      this.store.runFacts(workspaceId, range, ids),
      this.store.decisionFacts(workspaceId, range, ids),
      this.store.runsByDay(workspaceId, range, ids),
    ]);
    return buildAgentStats(range, agent, runs, decisions[0], days, MIN_DECISIONS);
  }

  /** All agents' stats for the range, with totals and cost breakdowns. */
  async performance(workspaceId: string, range: RangeBounds): Promise<AgentPerformance> {
    const agents = await this.store.agents(workspaceId);
    const ids = agents.map((a) => a.id);
    const [runs, decisions, days] = await Promise.all([
      this.store.runFacts(workspaceId, range, ids),
      this.store.decisionFacts(workspaceId, range, ids),
      this.store.runsByDay(workspaceId, range, ids),
    ]);
    return buildPerformance(range, agents, runs, decisions, days, MIN_DECISIONS);
  }
}
