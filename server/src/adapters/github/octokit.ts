import { Octokit } from 'octokit';
import type {
  GitHubClient,
  RepoRef,
  PrMeta,
  PrDetail,
  PrStatus,
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
} from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';

const TIMEOUT = 30_000;
/** Largest file `getFileText` will read (the workflow / manifest are tiny). */
const MAX_TEXT_BYTES = 64 * 1024;
/** Contents above this go through `git.createBlob` (base64) instead of inline tree content. */
const INLINE_CONTENT_MAX_BYTES = 64 * 1024;

/** Write calls must never be replayed after a failure - only a 429 (not processed) is retried. */
const retryOnlyRateLimit = {
  isRetryable: (err: unknown) => (err as { status?: number })?.status === 429,
};

function isNotFound(err: unknown): boolean {
  return (err as { status?: number })?.status === 404;
}

function mapWorkflowRun(r: {
  id: number;
  run_attempt?: number;
  status: string | null;
  conclusion: string | null;
  event: string;
  path: string;
  head_sha: string;
  created_at: string;
  repository: { full_name: string };
  head_repository?: { full_name: string } | null;
  triggering_actor?: { login: string } | null;
  pull_requests?: { number: number; base: { sha: string } }[] | null;
}): CiWorkflowRun {
  return {
    id: r.id,
    runAttempt: r.run_attempt ?? 1,
    status: r.status,
    conclusion: r.conclusion,
    event: r.event,
    path: r.path,
    headSha: r.head_sha,
    createdAt: r.created_at,
    repoFullName: r.repository.full_name,
    headRepoFullName: r.head_repository?.full_name ?? null,
    triggeringActor: r.triggering_actor?.login ?? null,
    pullRequests: (r.pull_requests ?? []).map((pr) => ({ number: pr.number, baseSha: pr.base.sha })),
  };
}

function mapStatus(state: string, merged: boolean | undefined): PrStatus {
  if (merged) return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

/**
 * GitHubClient over Octokit REST — thin. PAT auth (fine-grained).
 * Reads PR list/detail/files/commits/issue; posts reviews; opens PRs.
 */
export class OctokitGitHubClient implements GitHubClient, GitHubCiClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          // Fetch open + recently merged/closed (most-recently-updated first) so
          // the list shows which PRs are merged vs still open — not just open.
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            per_page: 50,
          });
          return res.data.map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: 0,
            deletions: 0,
            files_count: 0, // not present on the list payload; populated by getPullRequest
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
          }));
        })(),
        TIMEOUT,
      ),
    );
  }

  async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const { data: pr } = await this.octokit.rest.pulls.get({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
          });
          const { data: files } = await this.octokit.rest.pulls.listFiles({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const { data: commits } = await this.octokit.rest.pulls.listCommits({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const linkedIssue = await this.resolveLinkedIssue(repo, pr.body ?? '');
          return {
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: pr.additions,
            deletions: pr.deletions,
            files_count: pr.changed_files,
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
            body: pr.body,
            files: files.map((f) => ({
              path: f.filename,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch,
            })),
            commits: commits.map((c) => ({
              sha: c.sha,
              message: c.commit.message,
              author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
              committed_at: c.commit.author?.date,
            })),
            linked_issue: linkedIssue,
          };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** linked issue via regex on PR body (#123 / closes #123). */
  private async resolveLinkedIssue(repo: RepoRef, body: string): Promise<IssueMeta | undefined> {
    const m = body.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
    if (!m?.[1]) return undefined;
    try {
      return await this.getIssue(repo, Number(m[1]));
    } catch {
      return undefined;
    }
  }

  async postReview(
    repo: RepoRef,
    n: number,
    review: GitHubReviewPayload,
  ): Promise<{ id: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.createReview({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            body: review.body,
            event: review.event,
            comments: review.comments?.map((c) => ({
              path: c.path,
              line: c.line,
              body: c.body,
            })),
          });
          return { id: String(res.data.id) };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** Shape an Octokit review-comment payload into our DTO. */
  private mapReviewComment(c: {
    id: number;
    path: string;
    line?: number | null;
    original_line?: number | null;
    side?: string | null;
    body: string;
    user: { login: string } | null;
    created_at: string;
    html_url: string;
    in_reply_to_id?: number;
  }): PrReviewComment {
    return {
      id: c.id,
      path: c.path,
      line: c.line ?? null,
      original_line: c.original_line ?? null,
      side: c.side === 'LEFT' ? 'LEFT' : 'RIGHT',
      body: c.body,
      user: c.user?.login ?? 'unknown',
      created_at: c.created_at,
      html_url: c.html_url,
      in_reply_to_id: c.in_reply_to_id ?? null,
      // GitHub drops `line` when the comment can no longer be placed on the diff.
      is_outdated: c.line == null,
    };
  }

  async listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.listReviewComments({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          return res.data.map((c) => this.mapReviewComment(c));
        })(),
        TIMEOUT,
      ),
    );
  }

  async createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          if (input.inReplyTo != null) {
            const res = await this.octokit.rest.pulls.createReplyForReviewComment({
              owner: repo.owner,
              repo: repo.name,
              pull_number: n,
              comment_id: input.inReplyTo,
              body: input.body,
            });
            return this.mapReviewComment(res.data);
          }
          const res = await this.octokit.rest.pulls.createReviewComment({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            commit_id: input.commitId,
            path: input.path,
            line: input.line,
            side: input.side ?? 'RIGHT',
            body: input.body,
          });
          return this.mapReviewComment(res.data);
        })(),
        TIMEOUT,
      ),
    );
  }

  async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    return withRetry(
      () =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.create({
            owner: repo.owner,
            repo: repo.name,
            title: payload.title,
            head: payload.head,
            base: payload.base,
            body: payload.body,
          });
          return { url: res.data.html_url };
        })(),
        TIMEOUT,
      ),
      retryOnlyRateLimit,
    );
  }

  async commitFiles(
    repo: RepoRef,
    payload: CommitFilesPayload,
  ): Promise<{ branch: string }> {
    return withRetry(
      () =>
        withTimeout(
          (async () => {
            const owner = repo.owner;
            const name = repo.name;
            const g = this.octokit.rest.git;

            // Parent commit: the target branch if it already exists, else the base.
            // Only a 404 means "missing" - any other error must surface.
            let parentSha: string;
            let branchExists = false;
            try {
              const ref = await g.getRef({ owner, repo: name, ref: `heads/${payload.branch}` });
              parentSha = ref.data.object.sha;
              branchExists = true;
            } catch (err) {
              if (!isNotFound(err)) throw err;
              const baseRef = await g.getRef({ owner, repo: name, ref: `heads/${payload.base}` });
              parentSha = baseRef.data.object.sha;
            }

            // New tree layered on the parent's tree (so unrelated files are kept).
            const parentCommit = await g.getCommit({ owner, repo: name, commit_sha: parentSha });
            const entries: {
              path: string;
              mode: '100644';
              type: 'blob';
              content?: string;
              sha?: string | null;
            }[] = [];
            for (const f of payload.files) {
              if (Buffer.byteLength(f.contents, 'utf8') > INLINE_CONTENT_MAX_BYTES) {
                const blob = await g.createBlob({
                  owner,
                  repo: name,
                  content: Buffer.from(f.contents, 'utf8').toString('base64'),
                  encoding: 'base64',
                });
                entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.data.sha });
              } else {
                entries.push({ path: f.path, mode: '100644', type: 'blob', content: f.contents });
              }
            }
            for (const path of payload.deletePaths ?? []) {
              entries.push({ path, mode: '100644', type: 'blob', sha: null });
            }
            const tree = await g.createTree({
              owner,
              repo: name,
              base_tree: parentCommit.data.tree.sha,
              tree: entries,
            });

            const commit = await g.createCommit({
              owner,
              repo: name,
              message: payload.message,
              tree: tree.data.sha,
              parents: [parentSha],
            });

            if (branchExists) {
              // Fast-forward only: a concurrent push makes this fail rather than be lost.
              await g.updateRef({
                owner,
                repo: name,
                ref: `heads/${payload.branch}`,
                sha: commit.data.sha,
                force: false,
              });
            } else {
              await g.createRef({
                owner,
                repo: name,
                ref: `refs/heads/${payload.branch}`,
                sha: commit.data.sha,
              });
            }
            return { branch: payload.branch };
          })(),
          TIMEOUT,
        ),
      retryOnlyRateLimit,
    );
  }

  async findOpenPr(
    repo: RepoRef,
    branch: string,
  ): Promise<{ url: string; number: number } | null> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'open',
            head: `${repo.owner}:${branch}`,
            per_page: 1,
          });
          const pr = res.data[0];
          return pr ? { url: pr.html_url, number: pr.number } : null;
        })(),
        TIMEOUT,
      ),
    );
  }

  async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.issues.get({ owner: repo.owner, repo: repo.name, issue_number: n }),
        TIMEOUT,
      ),
    );
    return {
      number: res.data.number,
      title: res.data.title,
      body: res.data.body,
      state: res.data.state,
    };
  }

  async currentLogin(): Promise<string> {
    const res = await withRetry(() =>
      withTimeout(this.octokit.rest.users.getAuthenticated(), TIMEOUT),
    );
    return res.data.login;
  }

  // ---------- GitHubCiClient ----------

  async getRepository(repo: RepoRef): Promise<CiRepositoryInfo> {
    const res = await this.read(() =>
      this.octokit.rest.repos.get({ owner: repo.owner, repo: repo.name }),
    );
    return {
      id: res.data.id,
      defaultBranch: res.data.default_branch,
      fullName: res.data.full_name,
    };
  }

  async getBranchSha(repo: RepoRef, branch: string): Promise<string | null> {
    try {
      const res = await this.read(() =>
        this.octokit.rest.git.getRef({
          owner: repo.owner,
          repo: repo.name,
          ref: `heads/${branch}`,
        }),
      );
      return res.data.object.sha;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  /** Names only - secret values are never readable via the API. */
  async listActionsSecretNames(repo: RepoRef): Promise<string[]> {
    const res = await this.read(() =>
      this.octokit.rest.actions.listRepoSecrets({
        owner: repo.owner,
        repo: repo.name,
        per_page: 100,
      }),
    );
    return res.data.secrets.map((x) => x.name);
  }

  async listWorkflowRuns(
    repo: RepoRef,
    workflowFile: string,
    opts: { perPage: number },
  ): Promise<CiWorkflowRun[]> {
    const res = await this.read(() =>
      this.octokit.rest.actions.listWorkflowRuns({
        owner: repo.owner,
        repo: repo.name,
        workflow_id: workflowFile,
        status: 'completed',
        event: 'pull_request',
        per_page: opts.perPage,
      }),
    );
    return res.data.workflow_runs.map(mapWorkflowRun);
  }

  async listRepoWorkflowRuns(repo: RepoRef, opts: { perPage: number }): Promise<CiWorkflowRun[]> {
    const res = await this.read(() =>
      this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner: repo.owner,
        repo: repo.name,
        status: 'completed',
        event: 'pull_request',
        per_page: opts.perPage,
      }),
    );
    return res.data.workflow_runs.map(mapWorkflowRun);
  }

  async listRunArtifacts(repo: RepoRef, runId: number): Promise<CiRunArtifact[]> {
    const res = await this.read(() =>
      this.octokit.rest.actions.listWorkflowRunArtifacts({
        owner: repo.owner,
        repo: repo.name,
        run_id: runId,
        per_page: 100,
      }),
    );
    return res.data.artifacts.map((a) => ({
      id: a.id,
      name: a.name,
      sizeInBytes: a.size_in_bytes,
      expired: a.expired,
      workflowRunId: a.workflow_run?.id ?? runId,
    }));
  }

  async downloadArtifactZip(repo: RepoRef, artifactId: number): Promise<Uint8Array> {
    const res = await this.read(() =>
      this.octokit.rest.actions.downloadArtifact({
        owner: repo.owner,
        repo: repo.name,
        artifact_id: artifactId,
        archive_format: 'zip',
      }),
    );
    return new Uint8Array(res.data as ArrayBuffer);
  }

  async getFileBlobSha(repo: RepoRef, path: string, ref: string): Promise<string | null> {
    try {
      const res = await this.read(() =>
        this.octokit.rest.repos.getContent({ owner: repo.owner, repo: repo.name, path, ref }),
      );
      return Array.isArray(res.data) ? null : res.data.sha;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async pathExists(repo: RepoRef, path: string, ref: string): Promise<boolean> {
    try {
      await this.read(() =>
        this.octokit.rest.repos.getContent({ owner: repo.owner, repo: repo.name, path, ref }),
      );
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async getFileText(repo: RepoRef, path: string, ref: string): Promise<string | null> {
    try {
      const res = await this.read(() =>
        this.octokit.rest.repos.getContent({ owner: repo.owner, repo: repo.name, path, ref }),
      );
      const data = res.data;
      if (Array.isArray(data) || data.type !== 'file') return null;
      if (data.size > MAX_TEXT_BYTES) {
        throw new Error(`${path} is larger than ${MAX_TEXT_BYTES} bytes`);
      }
      return Buffer.from(data.content, 'base64').toString('utf8');
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async listTreePaths(repo: RepoRef, ref: string, prefix: string): Promise<string[]> {
    const res = await this.read(() =>
      this.octokit.rest.git.getTree({
        owner: repo.owner,
        repo: repo.name,
        tree_sha: ref,
        recursive: 'true',
      }),
    );
    if (res.data.truncated) {
      throw new Error(
        `The repository tree of ${repo.owner}/${repo.name} is too large to list completely (GitHub truncated it)`,
      );
    }
    return res.data.tree
      .filter((e) => e.type === 'blob' && typeof e.path === 'string' && e.path.startsWith(prefix))
      .map((e) => e.path as string);
  }

  async getPullState(
    repo: RepoRef,
    n: number,
  ): Promise<{ state: 'open' | 'closed'; merged: boolean }> {
    const res = await this.read(() =>
      this.octokit.rest.pulls.get({ owner: repo.owner, repo: repo.name, pull_number: n }),
    );
    return {
      state: res.data.state === 'open' ? 'open' : 'closed',
      merged: Boolean(res.data.merged),
    };
  }

  /** Read call with timeout + retry; Octokit errors (with `status`) propagate unchanged. */
  private read<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(() => withTimeout(fn(), TIMEOUT));
  }
}
