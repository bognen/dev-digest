import type {
  ChatMessage,
  FeatureModelChoice,
  LLMProvider,
  OnboardingTour,
  Provider as ProviderId,
  RunStepKind,
  TourSkeletonReason,
} from '@devdigest/shared';

/**
 * Narrow local ports (brief/ports.ts precedent): this module codes against
 * these shapes, never against `modules/repo-intel/**` (`no-cross-module`).
 * `RepoIntelService` satisfies `OnboardingRepoIntelPort` structurally when
 * wired in the container.
 */

export interface RankedFileRow {
  path: string;
  pagerank: number;
  /** Distinct files importing this one. */
  importers: number;
}

export interface FileHotness {
  applied: boolean;
  windowDays: number;
  anchorSha: string | null;
  historyDays: number;
  commitsAvailable: number;
  reason?: 'shallow_history' | 'no_clone' | 'commit_missing' | 'git_failed' | 'flag_off';
  /** Raw per-path commit counts inside the window. */
  counts: Record<string, number>;
}

export interface DetectedCommand {
  command: string;
  kind: RunStepKind;
  /** File the command was derived from (e.g. `package.json`). */
  source: string;
}

export interface StackItem {
  name: string;
  evidence: string;
}

export interface DirStat {
  path: string;
  files: number;
}

export interface RepoFacts {
  stack: StackItem[];
  structure: DirStat[];
  routes: string[];
  commands: DetectedCommand[];
  totalFiles: number;
  degraded?: boolean;
  reason?: string;
}

export interface IndexStateLite {
  status: string; // 'full' | 'partial' | 'degraded' | 'failed'
  reason?: string;
  degradedReason?: string;
  lastIndexedSha: string;
  filesIndexed: number;
}

export interface SymbolLite {
  file: string;
  name: string;
  exported: boolean;
}

export interface OnboardingRepoIntelPort {
  getIndexState(repoId: string): Promise<IndexStateLite>;
  getRankedFiles(repoId: string): Promise<RankedFileRow[]>;
  getFileHotness(repoId: string, windowDays?: number): Promise<FileHotness>;
  getRepoFacts(repoId: string): Promise<RepoFacts>;
  getSymbolsInFiles(repoId: string, paths: string[]): Promise<SymbolLite[]>;
}

// --- Domain (pure) shapes ---------------------------------------------------

export interface CriticalPathItem {
  path: string;
  importers: number;
  role: string;
  role_source: 'deterministic';
}

export interface ReadingPathItem {
  position: number;
  path: string;
  reason: string;
  score: number;
}

export interface ScoredFile {
  path: string;
  pagerank: number;
  hotness: number;
  importers: number;
  score: number;
}

export interface HotnessInfo {
  applied: boolean;
  windowDays: number;
  note: string | null;
}

/** Everything deterministic the tour is built from. */
export interface TourFacts {
  filesIndexed: number;
  filesConsidered: number;
  stack: StackItem[];
  structure: DirStat[];
  routes: string[];
  /** Already ordered (`orderRunSteps`). */
  commands: DetectedCommand[];
  criticalPaths: CriticalPathItem[];
  readingPath: ReadingPathItem[];
  hotness: HotnessInfo;
  /** Every indexed path eligible for grounding / linking. */
  indexPaths: string[];
}

export interface ValidatedLlm {
  summaryMarkdown: string | null;
  diagram: string | null;
  linkPaths: string[];
  criticalRoles: Record<string, string>;
  readingReasons: Record<string, string>;
  /** Commands from the model that exactly match a detected one. */
  commands: string[];
  firstTasks: Array<{ title: string; rationale: string; files: string[] }>;
  /** Non-null when fewer than FIRST_TASKS_MIN tasks survived grounding. */
  firstTasksUnavailableReason: string | null;
}

export interface DroppedCounts {
  paths: number;
  commands: number;
  entries: number;
}

export type ValidationResult =
  | { ok: true; value: ValidatedLlm; dropped: DroppedCounts }
  | { ok: false; reason: string };

export interface ValidationContext {
  indexPaths: Set<string>;
  commands: DetectedCommand[];
  readingPaths: string[];
  criticalPaths: string[];
}

export type PersistOutcome =
  | { kind: 'generated' }
  | { kind: 'skeleton'; skeletonReason: TourSkeletonReason }
  | { kind: 'failed' };

// --- Persistence ------------------------------------------------------------

export interface OnboardingRepoRef {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export interface StoredTour {
  repoId: string;
  tour: OnboardingTour;
  status: 'generated' | 'skeleton';
  skeletonReason: TourSkeletonReason | null;
  skeletonDetail: string | null;
  indexedSha: string;
  indexStatus: string | null;
  provider: string | null;
  model: string | null;
  filesIndexed: number;
  filesConsidered: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  generatedAt: Date;
  lastFailureReason: string | null;
  lastFailureAt: Date | null;
}

export interface OnboardingStore {
  /** Workspace-scoped: `undefined` for a repo in another workspace. */
  getRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoRef | undefined>;
  getTour(repoId: string): Promise<StoredTour | undefined>;
  upsertTour(row: StoredTour): Promise<void>;
  /** Updates only the failure columns, and only if a row exists. */
  recordFailure(repoId: string, reason: string, at: Date): Promise<void>;
}

// --- Injected collaborators -------------------------------------------------

export type ExcerptReader = (clonePath: string, path: string, maxBytes: number) => Promise<string | null>;
export type LlmResolver = (id: ProviderId) => Promise<LLMProvider>;
export type FeatureModelResolver = (workspaceId: string) => Promise<FeatureModelChoice>;
export type CostEstimator = (model: string, tokensIn: number, tokensOut: number) => number | null;
export interface TokenCounter {
  count(text: string): number;
}
export interface OnboardingLogger {
  info(obj: Record<string, unknown>, msg: string): void;
}

export interface OnboardingDeps {
  store: OnboardingStore;
  repoIntel: OnboardingRepoIntelPort;
  resolveModel: FeatureModelResolver;
  llm: LlmResolver;
  readExcerpt: ExcerptReader;
  tokenizer: TokenCounter;
  estimateCost: CostEstimator;
  loadSystemTemplate: () => Promise<string>;
  logger: OnboardingLogger;
  now?: () => Date;
}

export interface BuiltMessages {
  messages: ChatMessage[];
  tokens: number;
  filesConsidered: number;
}
