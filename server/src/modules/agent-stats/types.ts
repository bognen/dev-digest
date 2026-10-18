/** Agent stats module — domain types shared by repository, helpers and service. */

/** Half-open time range `[from, to)`. */
export interface RangeBounds {
  from: Date;
  to: Date;
}

export interface AgentRef {
  id: string;
  name: string;
}

/** Included-run facts for one agent × model group. */
export interface AgentRunFacts {
  agentId: string;
  model: string | null;
  runs: number;
  pricedRuns: number;
  costSum: number;
  durationRuns: number;
  durationSum: number;
  lastRunAt: Date;
}

/** Finding counts over one agent's included runs. */
export interface AgentDecisionFacts {
  agentId: string;
  total: number;
  accepted: number;
  dismissed: number;
  critical: number;
  warning: number;
  suggestion: number;
}

/** Included runs of one agent that loaded one skill (`skillId` null = no recorded skill). */
export interface SkillRunFacts {
  agentId: string;
  skillId: string | null;
  skillName: string | null;
  runs: number;
  costSum: number;
}

/** Included runs of one agent on one UTC day (`YYYY-MM-DD`). */
export interface DayRunFacts {
  agentId: string;
  day: string;
  runs: number;
}

/** Read port the service depends on (implemented by AgentStatsRepository). */
export interface AgentStatsStore {
  agents(workspaceId: string, agentId?: string): Promise<AgentRef[]>;
  runFacts(workspaceId: string, range: RangeBounds, agentIds: string[]): Promise<AgentRunFacts[]>;
  decisionFacts(workspaceId: string, range: RangeBounds, agentIds: string[]): Promise<AgentDecisionFacts[]>;
  runsByDay(workspaceId: string, range: RangeBounds, agentIds: string[]): Promise<DayRunFacts[]>;
  skillFacts(workspaceId: string, range: RangeBounds, agentIds: string[]): Promise<SkillRunFacts[]>;
}
