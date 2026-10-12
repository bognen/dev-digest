import type { ProjectContextTrace, ProjectDocSkipReason, RepoRef } from '@devdigest/shared';
import type { ProjectDoc } from '@devdigest/reviewer-core';

/** Domain shapes returned by the repository (never Drizzle row types). */
export interface ContextRepoInfo {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

export interface NamedRef {
  id: string;
  name: string;
}

/** An agent with the provider/model that determine its context budget. */
export interface AgentRef extends NamedRef {
  provider: string;
  model: string;
}

export interface ActiveSkillRef {
  id: string;
  name: string;
}

/** Persistence port implemented by `repository.ts`. */
export interface ProjectContextRepoPort {
  getRepo(workspaceId: string, repoId: string): Promise<ContextRepoInfo | undefined>;
  getAgent(workspaceId: string, agentId: string): Promise<AgentRef | undefined>;
  getSkill(workspaceId: string, skillId: string): Promise<NamedRef | undefined>;
  agentDocs(agentId: string, repoId: string): Promise<string[]>;
  skillDocs(skillId: string, repoId: string): Promise<string[]>;
  setAgentDocs(agentId: string, repoId: string, paths: string[]): Promise<void>;
  setSkillDocs(skillId: string, repoId: string, paths: string[]): Promise<void>;
  /** Linked skills that are enabled and not injection-flagged, by link order. */
  activeSkillsForAgent(agentId: string): Promise<ActiveSkillRef[]>;
  /** path -> number of distinct agents using it (direct or via an active skill). */
  usageCounts(workspaceId: string, repoId: string): Promise<Map<string, number>>;
}

export interface DiscoveredDoc {
  /** POSIX path relative to the checkout root. */
  path: string;
  sizeBytes: number;
}

export type ReadDocResult =
  | { ok: true; content: string }
  | { ok: false; reason: Exclude<ProjectDocSkipReason, 'over_budget'> };

/** Filesystem edge port (implemented by `checkout.ts`). */
export interface CheckoutReader {
  discover(clonePath: string): Promise<DiscoveredDoc[]>;
  read(clonePath: string, path: string): Promise<ReadDocResult>;
}

/** Syncs the checkout to the default branch. */
export type CheckoutSyncer = (ref: RepoRef, branch: string) => Promise<void>;

/** Context window (tokens) for a provider/model, or null when unknown. */
export type ContextWindowLookup = (provider: string, model: string) => number | null;

export interface TokenCounter {
  count(text: string): number;
}

export interface ProjectContextCounts {
  attached: number;
  added: number;
  skipped: number;
  dropped: number;
}

/** Result of assembling the project-context block for one run. */
export interface RunProjectContext {
  docs: ProjectDoc[];
  trace: ProjectContextTrace;
  counts: ProjectContextCounts;
  blockTokens: number;
}

export interface ResolveForRunInput {
  workspaceId: string;
  repoId: string;
  agentId: string;
  provider: string;
  model: string;
  activeSkills?: ActiveSkillRef[];
}

export interface ProjectContextResolver {
  resolveForRun(input: ResolveForRunInput): Promise<RunProjectContext>;
}
