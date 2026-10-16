import { z } from 'zod';
import type {
  PrMeta,
  PrDetail,
  IssueMeta,
  PrReviewComment,
} from './contracts/platform.js';

/**
 * Adapter interfaces. ALL external calls go behind these interfaces.
 * Real implementations live in `apps/api/src/adapters/*`; mock implementations
 * live alongside for tests/dev (Services depend on the interface, not the impl).
 */

// ---------- LLM ----------
export const ModelInfo = z.object({
  id: z.string(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']),
  label: z.string().nullish(),
  created: z.number().int().nullish(),
  /** Pricing in USD per 1M tokens (when the provider exposes it, e.g. OpenRouter). */
  pricing: z
    .object({ promptPerM: z.number(), completionPerM: z.number() })
    .nullish(),
  /** Max context window in tokens (when the provider exposes it). */
  contextLength: z.number().int().nullish(),
});
export type ModelInfo = z.infer<typeof ModelInfo>;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

/**
 * Structured-output request. `schema` is a Zod schema; `schemaName` names the
 * tool / json_schema. `maxRetries` controls reprompt-on-error.
 */
export interface StructuredRequest<T> {
  model: string;
  schema: z.ZodType<T>;
  schemaName: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * Max transport-level retries (429 / 5xx / network) per HTTP call. Omitted =
   * adapter default; `0` = a single attempt, no retry.
   */
  transportRetries?: number;
  /**
   * OpenRouter session id — groups related generations (e.g. all map-reduce
   * chunks of one review) into a session in the OpenRouter dashboard. Sent as
   * the `session_id` body field; ignored by providers that don't support it.
   */
  sessionId?: string;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  raw: string;
  attempts: number;
}

export interface LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'openrouter';
  listModels(): Promise<ModelInfo[]>;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  embed(texts: string[]): Promise<number[][]>;
}

// ---------- Embedder ----------
export interface Embedder {
  /** OpenAI text-embedding-3-small → 1536 dims. */
  embed(texts: string[]): Promise<number[][]>;
  readonly dims: number;
}

// ---------- GitHub (Octokit REST, thin) ----------
export interface RepoRef {
  owner: string;
  name: string;
}

export interface GitHubReviewPayload {
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments?: { path: string; line: number; body: string }[];
}

/** Create one standalone inline review comment (or a reply to a thread). */
export interface CreateReviewCommentInput {
  /** Head commit the comment pins to (GitHub requires commit_id). */
  commitId: string;
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
  body: string;
  /** When set, post as a reply to that comment's thread instead of a new one. */
  inReplyTo?: number;
}

export interface OpenPrPayload {
  title: string;
  head: string;
  base: string;
  body: string;
}

/** A single file to write in a commit (path relative to repo root + UTF-8 text). */
export interface CommitFile {
  path: string;
  contents: string;
}

export interface CommitFilesPayload {
  /** Branch to create-or-update with the commit (e.g. "devdigest/ci-<slug>"). */
  branch: string;
  /** Base branch to fork from when `branch` does not yet exist (e.g. "main"). */
  base: string;
  message: string;
  /** May be empty for a deletion-only commit (then `deletePaths` is non-empty). */
  files: CommitFile[];
  /** Repo-relative paths removed in the same commit (tree entries with sha null). */
  deletePaths?: string[];
}

export interface GitHubClient {
  listPullRequests(repo: RepoRef): Promise<PrMeta[]>;
  getPullRequest(repo: RepoRef, n: number): Promise<PrDetail>;
  postReview(repo: RepoRef, n: number, review: GitHubReviewPayload): Promise<{ id: string }>;
  /** List inline review comments on a PR (for the "Files changed" tab). */
  listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]>;
  /** Create one inline review comment (or reply) on a PR; returns the new comment. */
  createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment>;
  openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }>;
  /**
   * Commit `files` onto `branch` as ONE atomic commit (Git Data API: blobs →
   * tree → commit → ref). Creates the branch from `base` if missing, else
   * fast-forwards it. Fast-forward ONLY — the ref is never force-moved, so a
   * concurrent push to the branch makes the update fail instead of being lost.
   */
  commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }>;
  /** The open PR whose head is `branch`, if any (so re-publish reuses it). */
  findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string; number: number } | null>;
  getIssue(repo: RepoRef, n: number): Promise<IssueMeta>;
  /** GET /user — for "posting as @user". */
  currentLogin(): Promise<string>;
}

// ---------- GitHub CI (Export to CI + CI Runs ingest) ----------
export interface CiWorkflowRun {
  id: number;
  runAttempt: number;
  status: string | null;
  conclusion: string | null;
  event: string;
  /** Workflow file path as reported by the API, e.g. ".github/workflows/x.yml". */
  path: string;
  headSha: string;
  createdAt: string;
  repoFullName: string;
  /** Null when the head repository was deleted (treated as a fork). */
  headRepoFullName: string | null;
  triggeringActor: string | null;
  pullRequests: { number: number; baseSha: string }[];
}

export interface CiRunArtifact {
  id: number;
  name: string;
  sizeInBytes: number;
  expired: boolean;
  workflowRunId: number;
}

export interface CiRepositoryInfo {
  id: number;
  defaultBranch: string;
  fullName: string;
}

/**
 * GitHub operations used only by the `ci` module. Kept separate from
 * `GitHubClient` so the PR-review surface stays small; one adapter class
 * implements both.
 */
export interface GitHubCiClient {
  getRepository(repo: RepoRef): Promise<CiRepositoryInfo>;
  /** Head SHA of `branch`; null when the branch does not exist (404). */
  getBranchSha(repo: RepoRef, branch: string): Promise<string | null>;
  /** Names only — secret values are never readable. */
  listActionsSecretNames(repo: RepoRef): Promise<string[]>;
  listWorkflowRuns(
    repo: RepoRef,
    workflowFile: string,
    opts: { perPage: number },
  ): Promise<CiWorkflowRun[]>;
  /** Recent completed pull_request runs across the whole repo. */
  listRepoWorkflowRuns(repo: RepoRef, opts: { perPage: number }): Promise<CiWorkflowRun[]>;
  listRunArtifacts(repo: RepoRef, runId: number): Promise<CiRunArtifact[]>;
  downloadArtifactZip(repo: RepoRef, artifactId: number): Promise<Uint8Array>;
  /** Blob SHA of `path` at `ref`; null on 404. */
  getFileBlobSha(repo: RepoRef, path: string, ref: string): Promise<string | null>;
  /** True when `path` (file or directory) exists at `ref`. */
  pathExists(repo: RepoRef, path: string, ref: string): Promise<boolean>;
  /** UTF-8 text of a file at `ref` (at most 64 KiB); null on 404. */
  getFileText(repo: RepoRef, path: string, ref: string): Promise<string | null>;
  /** File paths from the recursive tree at `ref` whose path starts with `prefix`. */
  listTreePaths(repo: RepoRef, ref: string, prefix: string): Promise<string[]>;
  getPullState(
    repo: RepoRef,
    n: number,
  ): Promise<{ state: 'open' | 'closed'; merged: boolean }>;
}

// ---------- Git (simple-git, heavy) ----------
export interface CloneOptions {
  depth?: number;
  branch?: string;
}

export interface DiffHunk {
  file: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Lines present in the *new* file covered by this hunk (for grounding). */
  newLineNumbers: number[];
}

export interface UnifiedDiff {
  raw: string;
  files: { path: string; additions: number; deletions: number; hunks: DiffHunk[] }[];
}

export interface BlameLine {
  line: number;
  sha: string;
  author: string;
  date: string;
  summary: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface GitClient {
  clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }>;
  fetchPullHead(repo: RepoRef, n: number): Promise<void>;
  /**
   * Resync an already-cloned repo to the tip of `branch`: fetch from origin and
   * advance the local working tree to `origin/<branch>`. Unlike `clone`'s bare
   * `fetch` (which only moves remote-tracking refs), this moves local HEAD so a
   * subsequent index reflects the latest code. Returns the new HEAD sha.
   */
  sync(repo: RepoRef, branch: string): Promise<{ head: string }>;
  currentHead(repo: RepoRef): Promise<string>;
  diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff>;
  /**
   * Names of files changed between two commits (`git diff --name-only base..head`).
   * Two-dot form is intentional — we want files reachable from `head` but not `base`,
   * matching the incremental indexer's "what moved since last_indexed_sha?" semantics.
   * Returns an empty array when the two refs resolve to the same commit.
   */
  diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]>;
  blame(repo: RepoRef, path: string): Promise<BlameLine[]>;
  log(repo: RepoRef, path?: string): Promise<GitCommit[]>;
  readFile(repo: RepoRef, path: string): Promise<string>;
  /** True when `sha` is present in the local clone's object store. */
  hasCommit(repo: RepoRef, sha: string): Promise<boolean>;
  /**
   * File content at a specific commit (`git show <ref>:<path>`) without moving
   * the working tree. `null` when the path doesn't exist at that commit.
   */
  readFileAtRef(repo: RepoRef, ref: string, path: string): Promise<string | null>;
  /**
   * Per-path commit counts reachable from `anchorRef` with committer date >=
   * the anchor commit's date - `windowDays`. Never reads commit messages.
   * `shallow` is true when history is truncated (counts are then unreliable).
   */
  historyChurn(repo: RepoRef, anchorRef: string, windowDays: number): Promise<HistoryChurn>;
  clonePathFor(repo: RepoRef): string;
}

export interface HistoryChurn {
  shallow: boolean;
  anchorDate: string | null;
  oldestDate: string | null;
  commits: number;
  counts: Record<string, number>;
}

// ---------- CodeIndex (ripgrep + tree-sitter) ----------
export interface CodeMatch {
  path: string;
  line: number;
  text: string;
}

export interface CodeSymbol {
  path: string;
  name: string;
  kind: string;
  line: number;
}

export interface CodeReference {
  fromPath: string;
  toSymbol: string;
  line: number;
}

export interface CodeIndex {
  grep(repo: RepoRef, pattern: string): Promise<CodeMatch[]>;
  symbols(repo: RepoRef): Promise<CodeSymbol[]>;
  references(repo: RepoRef, symbol: string): Promise<CodeReference[]>;
}

// ---------- Auth (pluggable; MVP = LocalNoAuthProvider) ----------
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthWorkspace {
  id: string;
  name: string;
}

export interface AuthProvider {
  currentUser(req: unknown): Promise<AuthUser>;
  currentWorkspace(req: unknown): Promise<AuthWorkspace>;
}

// ---------- Secrets (pluggable; MVP = LocalSecretsProvider) ----------
export type SecretKey =
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'GITHUB_TOKEN'
  | 'DATABASE_URL'
  | (string & {});

export interface SecretsProvider {
  get(key: SecretKey): Promise<string | undefined>;
  /**
   * Persist a secret (BYO key entered via the UI). Optional — read-only
   * providers (e.g. the env-only MVP backend) may omit it.
   */
  set?(key: SecretKey, value: string): Promise<void>;
}
