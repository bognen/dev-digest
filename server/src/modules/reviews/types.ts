import type {
  ChildRunStatus,
  FeatureModelChoice,
  GitHubClient,
  Intent,
  IntentConfidence,
  IntentSource,
  IntentUnavailableReason,
  LLMProvider,
  PrIntentResponse,
  Provider,
  RunTrace,
} from '@devdigest/shared';

/**
 * Ports + domain shapes for the reviews module's Intent Layer (ring 2). The
 * intent pipeline (`pipeline/intent.ts`) depends on these narrow interfaces,
 * never on the Container or the concrete `ReviewRepository`/Drizzle — see
 * `inner-no-outer` / `inner-no-container` in the onion rules. `service.ts`
 * (the composition point for this module) wires the real implementations.
 */

/** Just enough of a pull request row for intent derivation + staleness checks. */
export interface IntentPullRow {
  id: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}

/** Just enough of a changed file for the diff-paths signal. */
export interface IntentFileRow {
  path: string;
  additions: number;
  deletions: number;
}

/** A persisted PR intent row (camelCase domain shape); the repository maps
 *  Drizzle rows into this — never `$inferSelect` beyond the repository. */
export interface StoredIntent {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  ticketRefs: string[];
  linkedIssue: number | null;
  provider: Provider | null;
  model: string | null;
  inputHash: string | null;
  headSha: string | null;
  generatedAt: Date;
}

/** Metadata written alongside the LLM-authored `Intent` fields on every upsert. */
export interface IntentMeta {
  confidence: IntentConfidence;
  sources: IntentSource[];
  ticketRefs: string[];
  linkedIssue: number | null;
  provider: Provider | null;
  model: string | null;
  inputHash: string | null;
  headSha: string | null;
}

/** Persistence port the intent service needs — a narrow slice of ReviewRepository. */
export interface IntentStore {
  getPull(workspaceId: string, prId: string): Promise<IntentPullRow | undefined>;
  getIntent(prId: string): Promise<StoredIntent | undefined>;
  upsertIntent(prId: string, intent: Intent, meta: IntentMeta): Promise<void>;
  getPrFiles(prId: string): Promise<{ path: string; additions: number; deletions: number; patch: string | null }[]>;
  /** First-line commit subjects for a PR, newest first, already limited to `limit` rows. */
  getPrCommitSubjects(prId: string, limit: number): Promise<string[]>;
}

/** The slice of a structured (pino-like) logger the intent service writes to. */
export interface IntentLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

/**
 * Explicit dependencies of `IntentService` — every external system through a
 * port, built ONCE from the Container (see `service.ts`'s constructor). No
 * logger here: logging is per-call (a run's logger, or a route's `req.log`),
 * so it travels through `IntentEnsureOpts.log` instead.
 */
export interface IntentDeps {
  store: IntentStore;
  /** Resolve an LLM provider by id (the container's factory, injected). */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** Settings -> Feature Models override for `standard`, else the registry default. */
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  /** Same-repo issue lookup only — the intent call never needs the rest of GitHubClient. */
  github: () => Promise<Pick<GitHubClient, 'getIssue'>>;
  /** Injectable clock (tests); defaults to `() => new Date()`. */
  now?: () => Date;
}

export type IntentTrigger = 'run' | 'overview' | 'regenerate';

export interface IntentEnsureInput {
  workspaceId: string;
  pull: IntentPullRow;
  repo: { owner: string; name: string };
  /** Changed files (diff-paths signal); path + counts only. */
  files: IntentFileRow[];
  /** Hunk-header trailing context, already extracted by the caller from
   *  whichever diff representation it has (UnifiedDiff in the executor,
   *  pr_files patches in the route path) via `hunkContexts()`. */
  hunkHeaders: string[];
}

export interface IntentEnsureOpts {
  /** Bypass the input-hash cache and regenerate unconditionally. */
  force?: boolean;
  trigger: IntentTrigger;
  /** Per-call structured logger (the run's logger, or the route's `req.log`). */
  log?: IntentLogger;
}

export type IntentEnsureResult =
  | { status: 'ok'; intent: StoredIntent; cached: boolean }
  | { status: 'unavailable'; reason: IntentUnavailableReason; previous?: StoredIntent };

/** The executor-facing port: pre-work that never throws. */
export interface IntentDeriver {
  ensure(input: IntentEnsureInput, opts: IntentEnsureOpts): Promise<IntentEnsureResult>;
}

export type { PrIntentResponse, IntentUnavailableReason };

// ---------------------------------------------------------------------------
// Project Context port (SPEC-01). Structurally identical to the project-context
// module's `resolveForRun`; the shapes are copied here (no import from
// `modules/project-context`, see `no-cross-module`) and the composition root
// supplies the real service.
// ---------------------------------------------------------------------------

export interface ProjectContextSkillRef {
  id: string;
  name: string;
}

export interface ProjectContextResolveInput {
  workspaceId: string;
  repoId: string;
  agentId: string;
  provider: string;
  model: string;
  activeSkills?: ProjectContextSkillRef[];
}

export interface ProjectContextResolved {
  docs: { path: string; content: string }[];
  trace: NonNullable<RunTrace['project_context']>;
  counts: { attached: number; added: number; skipped: number; dropped: number };
  blockTokens: number;
}

export interface ProjectContextResolver {
  resolveForRun(input: ProjectContextResolveInput): Promise<ProjectContextResolved>;
}

// ---------------------------------------------------------------------------
// Multi-agent run (SPEC-07) domain shapes. camelCase; the repository maps rows
// into these and `helpers.ts` maps them to the snake_case contract DTOs.
// ---------------------------------------------------------------------------

/** One child run to create alongside its multi-agent run. */
export interface MultiRunChildInsert {
  agentId: string;
  provider: string | null;
  model: string | null;
  /** First `MULTI_RUN_CONCURRENCY` children start `running`; the rest `queued`. */
  status: 'running' | 'queued';
  position: number;
}

/** A multi-agent run header joined with its PR's number + title. */
export interface MultiRunRecord {
  id: string;
  prId: string;
  prNumber: number;
  prTitle: string;
  ranAt: Date;
}

/** One child `agent_runs` row (agent name joined; null when the agent was deleted). */
export interface MultiRunChildRecord {
  runId: string;
  position: number;
  agentId: string | null;
  agentName: string | null;
  provider: string | null;
  model: string | null;
  status: ChildRunStatus;
  error: string | null;
  score: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

/** The newest multi-agent run of a PR plus its children's statuses. */
export interface LatestMultiRunRecord {
  id: string;
  ranAt: Date;
  childStatuses: ChildRunStatus[];
}

/** A multi-run header plus its children and finding count (previous-runs list). */
export interface MultiRunListRecord extends MultiRunRecord {
  children: MultiRunChildRecord[];
  findingCount: number;
}

/** One recent `done` run used for the estimate medians. */
export interface EstimateRunRow {
  agentId: string;
  durationMs: number | null;
  costUsd: number | null;
}

/** Per-agent estimate (domain shape of the `AgentEstimate` contract). */
export interface AgentEstimateValue {
  agentId: string;
  durationMs: number | null;
  costUsd: number | null;
}
