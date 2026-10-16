import type {
  CiFailOn,
  CiInstallationStatus,
  CiRejectReason,
  CiRunStatus,
  CiTarget,
  GitHubCiClient,
  GitHubClient,
  Provider,
} from '@devdigest/shared';

/**
 * Ports + domain shapes for the ci module (ring 2). Services and `pipeline/*`
 * depend on these, never on Drizzle rows, the Container or concrete adapters.
 * Row shapes of other modules are structural subsets (no cross-module import).
 */

export type CiAgentLike = {
  id: string;
  workspaceId: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: 'single-pass' | 'map-reduce' | 'auto';
  ciFailOn: CiFailOn;
  enabled: boolean;
};

export type CiSkillLike = {
  id: string;
  name: string;
  body: string;
  enabled: boolean;
  injectionDetected: boolean;
};

/** Agent persistence the ci module needs (subset of AgentsRepository). */
export interface CiAgentsPort {
  getById(workspaceId: string, id: string): Promise<CiAgentLike | undefined>;
  linkedSkills(agentId: string): Promise<{ skill: CiSkillLike; order: number }[]>;
}

/** Flat map of runner bundle filename (no directories) -> file text. */
export type CiRunnerBundle = Readonly<Record<string, string>>;

export interface CiLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

// ---- Domain records (mapped by the repository; never Drizzle rows) ----

export interface CiRepoRecord {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

export interface CiMemoryRow {
  kind: string;
  scope: string;
  content: string;
}

export type CiPrState = 'open' | 'merged' | 'closed';

export interface CiInstallationRecord {
  id: string;
  workspaceId: string;
  agentId: string;
  repoId: string;
  repo: string;
  repoGithubId: number;
  targetType: CiTarget;
  slug: string;
  workflowPath: string;
  workflowVersion: number;
  branch: string;
  prUrl: string | null;
  prNumber: number | null;
  prState: CiPrState | null;
  status: CiInstallationStatus;
  removalBranch: string | null;
  removalPrUrl: string | null;
  removalPrNumber: number | null;
  removedAt: Date | null;
  exportedCiFailOn: CiFailOn;
  installedAt: Date;
  updatedAt: Date;
}

export interface UpsertInstallation {
  workspaceId: string;
  agentId: string;
  repoId: string;
  repo: string;
  repoGithubId: number;
  slug: string;
  workflowPath: string;
  workflowVersion: number;
  branch: string;
  prUrl: string | null;
  prNumber: number | null;
  prState: CiPrState | null;
  exportedCiFailOn: CiFailOn;
}

export interface RemovalPrFields {
  branch: string;
  prUrl: string;
  prNumber: number;
}

export interface CiRunRecord {
  id: string;
  workspaceId: string;
  ciInstallationId: string | null;
  installationStatus: CiInstallationStatus | null;
  repoId: string | null;
  repoFullName: string;
  repoGithubId: number | null;
  workflowPath: string | null;
  agentSlug: string | null;
  workflowRunId: number;
  runAttempt: number;
  headSha: string | null;
  agentId: string | null;
  agentName: string | null;
  prNumber: number | null;
  ranAt: Date | null;
  status: CiRunStatus | null;
  reason: string | null;
  verdict: string | null;
  critical: number | null;
  warning: number | null;
  suggestion: number | null;
  blockers: number | null;
  durationMs: number | null;
  partial: boolean;
  skippedFiles: string[];
  version: string | null;
  findingsCount: number | null;
  costUsd: number | null;
  /** Always `buildRunUrl(...)` or null — foreign values are dropped on read. */
  runUrl: string | null;
}

/** Common fields of every persisted run, accepted or not. */
export interface CiRunKey {
  workspaceId: string;
  installationId: string;
  repoId: string;
  repoFullName: string;
  repoGithubId: number;
  workflowPath: string;
  agentSlug: string;
  agentId: string | null;
  agentName: string | null;
  workflowRunId: number;
  runAttempt: number;
  headSha: string | null;
  prNumber: number | null;
  ranAt: Date;
}

export interface InsertAcceptedRun extends CiRunKey {
  /** The agent_runs row needs a non-null agent. */
  agentId: string;
  provider: string | null;
  model: string | null;
  verdict: string;
  findingsCount: number;
  critical: number;
  warning: number;
  suggestion: number;
  blockers: number;
  costUsd: number | null;
  durationMs: number;
  partial: boolean;
  skippedFiles: string[];
  version: string;
  status: Extract<CiRunStatus, 'succeeded' | 'no_findings'>;
}

export interface InsertNonAcceptedRun extends CiRunKey {
  status: Extract<CiRunStatus, 'failed' | 'skipped' | 'result_expired' | 'rejected'>;
  reason: CiRejectReason | string | null;
}

export interface CiLatestRun {
  installationId: string;
  status: CiRunStatus;
  ranAt: Date;
}

/** Persistence port implemented by `CiRepository`. Workspace-scoped. */
export interface CiStore {
  getRepo(workspaceId: string, repoId: string): Promise<CiRepoRecord | undefined>;
  listMemoryForExport(workspaceId: string, repoId: string): Promise<CiMemoryRow[]>;

  findInstallation(agentId: string, repoId: string): Promise<CiInstallationRecord | undefined>;
  getInstallation(workspaceId: string, id: string): Promise<CiInstallationRecord | undefined>;
  /** Slugs held by OTHER agents' non-removed installations in the repo. */
  listRepoSlugsInUse(repoId: string, excludeAgentId: string): Promise<string[]>;
  upsertInstallation(input: UpsertInstallation): Promise<CiInstallationRecord>;
  setRemovalPending(id: string, fields: RemovalPrFields): Promise<void>;
  markRemoved(id: string): Promise<void>;
  reactivate(id: string): Promise<void>;
  updatePrState(id: string, prState: CiPrState): Promise<void>;
  listInstallationsForAgent(
    workspaceId: string,
    agentId: string,
  ): Promise<CiInstallationRecord[]>;
  /** `active` + `removal_pending` installations. */
  listPollableInstallations(workspaceId: string): Promise<CiInstallationRecord[]>;

  /** `"<workflowRunId>:<runAttempt>"` keys of every stored run. */
  existingRunKeys(workspaceId: string): Promise<Set<string>>;
  /** Returns false when the run key already existed (nothing written). */
  insertAcceptedRun(input: InsertAcceptedRun): Promise<boolean>;
  insertNonAcceptedRun(input: InsertNonAcceptedRun): Promise<boolean>;
  listRuns(
    workspaceId: string,
    opts?: { agentId?: string; limit?: number },
  ): Promise<CiRunRecord[]>;
  acceptedRunCountsByInstallation(workspaceId: string): Promise<Map<string, number>>;
  latestRunPerInstallation(workspaceId: string): Promise<Map<string, CiLatestRun>>;
}

/**
 * Explicit dependencies of the ci service and pipelines (no Container).
 * No LLM dependency: ingest is pull-only and never calls a model.
 */
export interface CiDeps {
  store: CiStore;
  agents: CiAgentsPort;
  github: () => Promise<GitHubClient>;
  githubCi: () => Promise<GitHubCiClient>;
  /**
   * The built agent-runner bundle: every file of `agent-runner/dist/` (filename -> text).
   * null when it has not been built (no `index.js`).
   */
  readRunnerBundle: () => Promise<CiRunnerBundle | null>;
  /** Studio secret values (for the export secret-leak scan). */
  studioSecretValues: () => Promise<string[]>;
  logger: CiLogger;
  now: () => Date;
}
