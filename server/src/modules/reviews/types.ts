import type {
  FeatureModelChoice,
  GitHubClient,
  Intent,
  IntentConfidence,
  IntentSource,
  IntentUnavailableReason,
  LLMProvider,
  PrIntentResponse,
  Provider,
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
  /** Settings -> Feature Models override for `review_intent`, else the registry default. */
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
