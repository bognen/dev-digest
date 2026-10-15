import type { z } from 'zod';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  Embedder,
  GitHubClient,
  RepoRef,
  PrMeta,
  PrDetail,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  IssueMeta,
  GitHubCiClient,
  CiWorkflowRun,
  CiRunArtifact,
  CiRepositoryInfo,
  GitClient,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
  HistoryChurn,
  CodeIndex,
  CodeMatch,
  CodeSymbol,
  CodeReference,
  AuthProvider,
  AuthUser,
  AuthWorkspace,
  SecretsProvider,
  SecretKey,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './git/diff-parser.js';
import type { FetchedText, UrlFetcher } from './url-fetcher/types.js';

/**
 * Deterministic MOCK adapters for tests/dev — NO real network. Each mirrors the
 * adapter interface. The mock LLM returns a caller-supplied fixture (or a default)
 * for completeStructured, so review/grounding flows can be tested end-to-end.
 */

// ---------- Mock LLM ----------
export interface MockLLMOptions {
  models?: ModelInfo[];
  /** Fixture returned by completeStructured (validated against the schema). */
  structured?: unknown;
  /**
   * Per-schemaName fixtures for multi-call flows (e.g. the conventions 2-step
   * dialogue: 'ConventionFileSelection' then 'ConventionExtraction'). Looked up
   * by req.schemaName; falls back to `structured` when no entry matches.
   */
  structuredBySchema?: Record<string, unknown>;
  completionText?: string;
  embedding?: number[];
  /** completeStructured records the call, then rejects with this error. */
  throwOnStructured?: Error;
  /** completeStructured records the call, then waits this long before resolving. */
  structuredDelayMs?: number;
}

export class MockLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';
  public calls: { method: string; req: unknown }[] = [];

  constructor(
    id: 'openai' | 'anthropic' = 'openai',
    private opts: MockLLMOptions = {},
  ) {
    this.id = id;
  }

  async listModels(): Promise<ModelInfo[]> {
    this.calls.push({ method: 'listModels', req: null });
    return (
      this.opts.models ?? [
        { id: 'gpt-4.1', provider: this.id === 'anthropic' ? 'anthropic' : 'openai' },
      ]
    );
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push({ method: 'complete', req });
    return {
      text: this.opts.completionText ?? 'mock completion',
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    if (this.opts.throwOnStructured) throw this.opts.throwOnStructured;
    if (this.opts.structuredDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.opts.structuredDelayMs));
    }
    const fixture = this.opts.structuredBySchema?.[req.schemaName] ?? this.opts.structured ?? {};
    const parsed = (req.schema as z.ZodType<T>).safeParse(fixture);
    if (!parsed.success) {
      throw new Error(`MockLLMProvider fixture failed schema: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    this.calls.push({ method: 'embed', req: texts });
    return texts.map(() => this.opts.embedding ?? new Array(1536).fill(0));
  }
}

// ---------- Mock Embedder ----------
export class MockEmbedder implements Embedder {
  readonly dims = 1536;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((_, i) => new Array(1536).fill(0).map((_, j) => (i + j) % 2));
  }
}

// ---------- Mock GitHub ----------
export interface MockGitHubOptions {
  pulls?: PrMeta[];
  detail?: Partial<PrDetail>;
  login?: string;
  /** Existing inline review comments returned by listReviewComments. */
  comments?: PrReviewComment[];
  /** Repository metadata returned by `getRepository` (CI). */
  repository?: CiRepositoryInfo;
  /** Existing branches -> head SHA (CI). */
  branches?: Record<string, string>;
  /** Pre-existing open PRs keyed by head branch (CI). */
  openPrs?: Record<string, { url: string; number: number }>;
  /** Actions secret names; `secretsError` makes the list call fail instead. */
  secretNames?: string[];
  secretsError?: { status: number; message: string };
  /** Workflow runs per workflow file name, and repo-wide (CI). */
  runs?: Record<string, CiWorkflowRun[]>;
  repoRuns?: CiWorkflowRun[];
  /** Artifacts per workflow run id, and artifact zip bytes per artifact id (CI). */
  artifacts?: Record<number, CiRunArtifact[]>;
  artifactZips?: Record<number, Uint8Array>;
  /** File blobs keyed `path@ref` -> { sha, text } (CI). */
  blobs?: Record<string, { sha: string; text: string }>;
  /** Recursive tree paths per ref (CI). */
  trees?: Record<string, string[]>;
  /** Pull state per PR number (CI). */
  pullStates?: Record<number, { state: 'open' | 'closed'; merged: boolean }>;
  /** Make a given operation throw an error carrying an HTTP `status`. */
  failOn?: Partial<Record<MockGitHubOp, { status: number; message: string }>>;
}

export type MockGitHubOp = keyof GitHubClient | keyof GitHubCiClient;

export class MockGitHubClient implements GitHubClient, GitHubCiClient {
  public posted: { n: number; review: GitHubReviewPayload }[] = [];
  public openedPrs: OpenPrPayload[] = [];
  public committed: CommitFilesPayload[] = [];
  public createdComments: CreateReviewCommentInput[] = [];
  /** Every call in order, for assertions. */
  public calls: { op: MockGitHubOp; args: unknown[] }[] = [];

  private record(op: MockGitHubOp, ...args: unknown[]): void {
    this.calls.push({ op, args });
    const fail = this.opts.failOn?.[op];
    if (fail) throw Object.assign(new Error(fail.message), { status: fail.status });
  }

  constructor(private opts: MockGitHubOptions = {}) {}

  async listPullRequests(_repo: RepoRef): Promise<PrMeta[]> {
    return (
      this.opts.pulls ?? [
        {
          number: 482,
          title: 'Add rate limiting to public API endpoints',
          author: 'marisa.koch',
          branch: 'feat/rate-limit-public',
          base: 'main',
          head_sha: 'a1b2c3d4',
          additions: 247,
          deletions: 38,
          files_count: 9,
          status: 'open',
          opened_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T03:00:00Z',
        },
      ]
    );
  }

  async getPullRequest(_repo: RepoRef, n: number): Promise<PrDetail> {
    const base: PrDetail = {
      number: n,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      head_sha: 'a1b2c3d4',
      additions: 247,
      deletions: 38,
      files_count: 9,
      status: 'open',
      body: 'Add rate limiting. Closes #471.',
      files: [
        {
          path: 'src/config.ts',
          additions: 4,
          deletions: 0,
          patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
        },
      ],
      commits: [
        { sha: 'a1b2c3d4', message: 'Add limiter', author: 'marisa.koch', committed_at: null },
      ],
      linked_issue: null,
    };
    return { ...base, ...this.opts.detail };
  }

  async postReview(_repo: RepoRef, n: number, review: GitHubReviewPayload): Promise<{ id: string }> {
    this.posted.push({ n, review });
    return { id: `mock-review-${n}` };
  }

  async listReviewComments(_repo: RepoRef, _n: number): Promise<PrReviewComment[]> {
    return this.opts.comments ?? [];
  }

  async createReviewComment(
    _repo: RepoRef,
    _n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    this.createdComments.push(input);
    return {
      id: this.createdComments.length,
      path: input.path,
      line: input.line,
      original_line: input.line,
      side: input.side ?? 'RIGHT',
      body: input.body,
      user: this.opts.login ?? 'mock-user',
      created_at: '2026-06-01T00:00:00Z',
      html_url: `https://github.com/mock/mock/pull/1#discussion_r${this.createdComments.length}`,
      in_reply_to_id: input.inReplyTo ?? null,
      is_outdated: false,
    };
  }

  async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    this.record('openPullRequest', repo, payload);
    this.openedPrs.push(payload);
    return { url: 'https://github.com/mock/mock/pull/1' };
  }

  async commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }> {
    this.record('commitFiles', repo, payload);
    this.committed.push(payload);
    return { branch: payload.branch };
  }

  async findOpenPr(
    repo: RepoRef,
    branch: string,
  ): Promise<{ url: string; number: number } | null> {
    this.record('findOpenPr', repo, branch);
    const configured = this.opts.openPrs?.[branch];
    if (configured) return configured;
    const pr = this.openedPrs.find((p) => p.head === branch);
    return pr ? { url: 'https://github.com/mock/mock/pull/1', number: 1 } : null;
  }

  // ---- GitHubCiClient ----

  async getRepository(repo: RepoRef): Promise<CiRepositoryInfo> {
    this.record('getRepository', repo);
    return (
      this.opts.repository ?? {
        id: 1,
        defaultBranch: 'main',
        fullName: `${repo.owner}/${repo.name}`,
      }
    );
  }

  async getBranchSha(repo: RepoRef, branch: string): Promise<string | null> {
    this.record('getBranchSha', repo, branch);
    const branches = this.opts.branches ?? { main: 'mock-main-sha' };
    return branches[branch] ?? null;
  }

  async listActionsSecretNames(repo: RepoRef): Promise<string[]> {
    this.record('listActionsSecretNames', repo);
    if (this.opts.secretsError) {
      throw Object.assign(new Error(this.opts.secretsError.message), {
        status: this.opts.secretsError.status,
      });
    }
    return this.opts.secretNames ?? [];
  }

  async listWorkflowRuns(
    repo: RepoRef,
    workflowFile: string,
    opts: { perPage: number },
  ): Promise<CiWorkflowRun[]> {
    this.record('listWorkflowRuns', repo, workflowFile, opts);
    return (this.opts.runs?.[workflowFile] ?? []).slice(0, opts.perPage);
  }

  async listRepoWorkflowRuns(repo: RepoRef, opts: { perPage: number }): Promise<CiWorkflowRun[]> {
    this.record('listRepoWorkflowRuns', repo, opts);
    return (this.opts.repoRuns ?? []).slice(0, opts.perPage);
  }

  async listRunArtifacts(repo: RepoRef, runId: number): Promise<CiRunArtifact[]> {
    this.record('listRunArtifacts', repo, runId);
    return this.opts.artifacts?.[runId] ?? [];
  }

  async downloadArtifactZip(repo: RepoRef, artifactId: number): Promise<Uint8Array> {
    this.record('downloadArtifactZip', repo, artifactId);
    const zip = this.opts.artifactZips?.[artifactId];
    if (!zip) throw Object.assign(new Error('Not Found'), { status: 404 });
    return zip;
  }

  async getFileBlobSha(repo: RepoRef, path: string, ref: string): Promise<string | null> {
    this.record('getFileBlobSha', repo, path, ref);
    return this.opts.blobs?.[`${path}@${ref}`]?.sha ?? null;
  }

  async pathExists(repo: RepoRef, path: string, ref: string): Promise<boolean> {
    this.record('pathExists', repo, path, ref);
    const blobs = this.opts.blobs ?? {};
    const dir = path.endsWith('/') ? path : `${path}/`;
    return Object.keys(blobs).some(
      (k) => k.endsWith(`@${ref}`) && (k === `${path}@${ref}` || k.startsWith(dir)),
    );
  }

  async getFileText(repo: RepoRef, path: string, ref: string): Promise<string | null> {
    this.record('getFileText', repo, path, ref);
    return this.opts.blobs?.[`${path}@${ref}`]?.text ?? null;
  }

  async listTreePaths(repo: RepoRef, ref: string, prefix: string): Promise<string[]> {
    this.record('listTreePaths', repo, ref, prefix);
    return (this.opts.trees?.[ref] ?? []).filter((p) => p.startsWith(prefix));
  }

  async getPullState(
    repo: RepoRef,
    n: number,
  ): Promise<{ state: 'open' | 'closed'; merged: boolean }> {
    this.record('getPullState', repo, n);
    return this.opts.pullStates?.[n] ?? { state: 'open', merged: false };
  }

  async getIssue(_repo: RepoRef, n: number): Promise<IssueMeta> {
    return { number: n, title: `Issue #${n}`, body: 'mock issue', state: 'open' };
  }

  async currentLogin(): Promise<string> {
    return this.opts.login ?? 'mock-user';
  }
}

// ---------- Mock Git ----------
export interface MockGitOptions {
  diff?: string;
  files?: Record<string, string>;
  /** Name-only diff result (drives the incremental indexer's "changed files since X" path). */
  diffNameOnly?: string[];
  /** Override `currentHead()` so tests can simulate "sha unchanged since last index". */
  head?: string;
  /** Head `currentHead()` returns AFTER `sync()` runs — simulates fetch+reset advancing HEAD. */
  syncedHead?: string;
  /** `historyChurn()` result; defaults to a shallow, empty history. */
  churn?: HistoryChurn;
}

export class MockGitClient implements GitClient {
  public cloned: { repo: RepoRef; url: string }[] = [];
  public syncs: { repo: RepoRef; branch: string }[] = [];
  private syncedHead?: string;

  constructor(private opts: MockGitOptions = {}) {}

  clonePathFor(repo: RepoRef): string {
    return `/mock/clones/${repo.owner}/${repo.name}`;
  }
  async clone(repo: RepoRef, url: string, _opts?: CloneOptions): Promise<{ path: string }> {
    this.cloned.push({ repo, url });
    return { path: this.clonePathFor(repo) };
  }
  async fetchPullHead(): Promise<void> {}
  async hasCommit(): Promise<boolean> {
    return true;
  }
  async readFileAtRef(): Promise<string | null> {
    return null;
  }
  async historyChurn(): Promise<HistoryChurn> {
    return (
      this.opts.churn ?? { shallow: true, anchorDate: null, oldestDate: null, commits: 1, counts: {} }
    );
  }
  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    this.syncs.push({ repo, branch });
    // After a sync, HEAD advances to syncedHead (or stays at head if unset).
    this.syncedHead = this.opts.syncedHead ?? this.opts.head ?? 'a1b2c3d4';
    return { head: this.syncedHead };
  }
  async currentHead(): Promise<string> {
    return this.syncedHead ?? this.opts.head ?? 'a1b2c3d4';
  }
  async diffNameOnly(): Promise<string[]> {
    return this.opts.diffNameOnly ?? [];
  }
  async diff(): Promise<UnifiedDiff> {
    const raw =
      this.opts.diff ??
      'diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
    return parseUnifiedDiff(raw);
  }
  async blame(): Promise<BlameLine[]> {
    return [{ line: 1, sha: 'a1b2c3d4', author: 'marisa.koch', date: '2026-06-01', summary: 'init' }];
  }
  async log(): Promise<GitCommit[]> {
    return [{ sha: 'a1b2c3d4', message: 'init', author: 'marisa.koch', date: '2026-06-01' }];
  }
  async readFile(_repo: RepoRef, path: string): Promise<string> {
    return this.opts.files?.[path] ?? '';
  }
}

// ---------- Mock CodeIndex ----------
export class MockCodeIndex implements CodeIndex {
  async grep(_repo: RepoRef, pattern: string): Promise<CodeMatch[]> {
    return [{ path: 'src/config.ts', line: 12, text: `match for ${pattern}` }];
  }
  async symbols(): Promise<CodeSymbol[]> {
    return [{ path: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function', line: 25 }];
  }
  async references(_repo: RepoRef, symbol: string): Promise<CodeReference[]> {
    return [{ fromPath: 'src/api/public/index.ts', toSymbol: symbol, line: 23 }];
  }
}

// ---------- Mock Auth / Secrets ----------
export class MockAuthProvider implements AuthProvider {
  constructor(
    private user: AuthUser = { id: 'u1', email: 'you@local', name: 'You' },
    private workspace: AuthWorkspace = { id: 'w1', name: 'default' },
  ) {}
  async currentUser(): Promise<AuthUser> {
    return this.user;
  }
  async currentWorkspace(): Promise<AuthWorkspace> {
    return this.workspace;
  }
}

export class MockSecretsProvider implements SecretsProvider {
  constructor(private secrets: Partial<Record<string, string>> = {}) {}
  async get(key: SecretKey): Promise<string | undefined> {
    return this.secrets[key as string];
  }
}

// ---------- Mock URL fetcher ----------
/**
 * Canned responses by URL (exact match) — NO network. An unknown URL throws, so a
 * test can never silently depend on a real fetch. `calls` records every URL asked.
 */
export class MockUrlFetcher implements UrlFetcher {
  public calls: string[] = [];
  constructor(private responses: Record<string, string | FetchedText | Error> = {}) {}
  async fetchText(url: string): Promise<FetchedText> {
    this.calls.push(url);
    const r = this.responses[url];
    if (r === undefined) throw new Error(`MockUrlFetcher: no response for ${url}`);
    if (r instanceof Error) throw r;
    return typeof r === 'string' ? { url, text: r, contentType: 'text/plain' } : r;
  }
}
