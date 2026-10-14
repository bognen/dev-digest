import type { LLMProvider, Provider, RepoRef, UnifiedDiff } from '@devdigest/shared';

/**
 * Ports the eval module depends on. Wired in the composition root
 * (`platform/container.ts`) so the service and executor never import
 * adapters, db rows or another module's folder (onion rule). Row shapes are
 * structural subsets of the real rows.
 */

export type AgentLike = {
  id: string;
  workspaceId: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: 'single-pass' | 'map-reduce' | 'auto';
  enabled: boolean;
  version: number;
};

export type SkillRowLike = {
  id: string;
  name: string;
  body: string;
  enabled: boolean;
  version: number;
  injectionDetected: boolean;
};

export type FindingLike = {
  id: string;
  reviewId: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
  category: string;
  title: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
};

export type PullLike = {
  id: string;
  workspaceId: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  base: string;
  headSha: string;
};

export type RepoRowLike = { id: string; owner: string; name: string };

export interface EvalLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/** Agent persistence the eval module needs (subset of AgentsRepository). */
export interface EvalAgentsPort {
  getById(workspaceId: string, id: string): Promise<AgentLike | undefined>;
  list(workspaceId: string): Promise<AgentLike[]>;
  linkedSkills(agentId: string): Promise<{ skill: SkillRowLike; order: number }[]>;
  update(
    workspaceId: string,
    id: string,
    patch: { provider?: Provider; model?: string; systemPrompt?: string; strategy?: AgentLike['strategy'] },
  ): Promise<AgentLike | undefined>;
  setSkills(agentId: string, skillIds: string[]): Promise<void>;
}

/** Skill lookups (subset of SkillsRepository). */
export interface EvalSkillsPort {
  getById(workspaceId: string, id: string): Promise<SkillRowLike | undefined>;
  list(workspaceId: string): Promise<(SkillRowLike & { id: string; name: string })[]>;
}

/** Finding → review → pull resolution + the repo row (subset of ReviewRepository). */
export interface EvalReviewsPort {
  findingContext(
    findingId: string,
  ): Promise<{ finding: FindingLike; review: { agentId: string | null }; pull: PullLike } | undefined>;
  getRepo(repoId: string): Promise<RepoRowLike | undefined>;
}

export interface EvalPorts {
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** Raw unified diff of a PR (git, falling back to persisted patches). */
  loadPrDiff: (pull: PullLike, repo: RepoRowLike) => Promise<string>;
  /** File content at a commit; null when missing/unreadable. */
  readFileAtRef: (repo: RepoRef, ref: string, path: string) => Promise<string | null>;
  parseDiff: (raw: string) => UnifiedDiff;
  logger: EvalLogger;
  now?: () => Date;
}
