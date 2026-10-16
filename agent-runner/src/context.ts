import { readFileSync } from 'node:fs';
import { RunnerError } from './errors.js';

/**
 * Resolves the PR context (owner/repo/number/title/body/fork) from the
 * GitHub-Actions-injected env vars + the standard `pull_request` event
 * payload â€” "the CI context" the runner assembles the diff + PR body/title
 * from (T8 action). `GITHUB_REPOSITORY` and `PR_NUMBER` are explicit env vars
 * the generated workflow sets (`server/src/modules/ci/workflow.ts`);
 * `GITHUB_EVENT_PATH` is a default GitHub Actions runtime var (always present)
 * pointing at the JSON payload for the triggering event, which carries the
 * (untrusted, author-controlled) PR title/body and the fork flag.
 */

export interface CiEnv {
  GITHUB_REPOSITORY?: string;
  PR_NUMBER?: string;
  GITHUB_EVENT_PATH?: string;
  [key: string]: string | undefined;
}

export interface PrContext {
  owner: string;
  repo: string;
  prNumber: number;
  /** PR title (untrusted, author-controlled). */
  title: string;
  /** PR body/description (untrusted, author-controlled). */
  body: string;
  /** Numeric GitHub repository id (`GITHUB_REPOSITORY_ID` / event payload). */
  repositoryId: number;
  /** Reviewed PR head commit SHA (from the event payload). */
  headSha: string;
  /** Head repo differs from the base repo, or the head repo is gone. */
  isFork: boolean;
  /** Triggered by Dependabot (`GITHUB_TRIGGERING_ACTOR ?? GITHUB_ACTOR`). */
  isDependabot: boolean;
  /** `GITHUB_RUN_ID`. */
  runId: number;
  /** `GITHUB_RUN_ATTEMPT` (defaults to 1). */
  runAttempt: number;
}

interface PullRequestEventPayload {
  repository?: { id?: number } | null;
  pull_request?: {
    number?: number;
    title?: string;
    body?: string | null;
    head?: { sha?: string; repo?: { full_name?: string } | null };
    base?: { repo?: { full_name?: string } | null };
  };
}

function readEventPayload(
  eventPath: string | undefined,
  readFile: typeof readFileSync,
): PullRequestEventPayload | null {
  if (!eventPath) return null;
  let raw: string;
  try {
    raw = readFile(eventPath, 'utf8') as unknown as string;
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as PullRequestEventPayload;
  } catch {
    return null;
  }
}

function detectOrigin(
  env: CiEnv,
  event: PullRequestEventPayload | null,
): { isFork: boolean; isDependabot: boolean } {
  const pr = event?.pull_request;
  const baseName = (pr?.base?.repo?.full_name ?? env.GITHUB_REPOSITORY ?? '').toLowerCase();
  let isFork = false;
  if (pr) {
    const head = pr.head?.repo;
    // `head.repo` is null when the fork was deleted — still a fork case.
    isFork = !head || !head.full_name || head.full_name.toLowerCase() !== baseName;
  }
  const actor = env.GITHUB_TRIGGERING_ACTOR ?? env.GITHUB_ACTOR;
  return { isFork, isDependabot: actor === 'dependabot[bot]' };
}

/**
 * Cheap origin check used by the skip step — needs no PR number, repository id
 * or head SHA, so it can run before anything else is validated.
 */
export function resolveRunOrigin(
  env: CiEnv,
  readFile: typeof readFileSync = readFileSync,
): { isFork: boolean; isDependabot: boolean } {
  return detectOrigin(env, readEventPayload(env.GITHUB_EVENT_PATH, readFile));
}

function positiveInt(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Resolve the PR context from env + (best-effort) event payload. */
export function resolvePrContext(
  env: CiEnv,
  readFile: typeof readFileSync = readFileSync,
): PrContext {
  const repository = env.GITHUB_REPOSITORY;
  if (!repository || !repository.includes('/')) {
    throw new RunnerError(
      `GITHUB_REPOSITORY must be set to "owner/name" (got: ${JSON.stringify(repository)})`,
    );
  }
  const [owner, repo] = repository.split('/', 2) as [string, string];

  const event = readEventPayload(env.GITHUB_EVENT_PATH, readFile);
  const pr = event?.pull_request;

  const prNumber = positiveInt(env.PR_NUMBER ?? pr?.number);
  if (prNumber === null) {
    throw new RunnerError(
      `PR_NUMBER must resolve to a positive integer (env PR_NUMBER=${JSON.stringify(env.PR_NUMBER)}, event pull_request.number=${JSON.stringify(pr?.number)})`,
    );
  }

  const repositoryId = positiveInt(env.GITHUB_REPOSITORY_ID ?? event?.repository?.id);
  if (repositoryId === null) {
    throw new RunnerError('GITHUB_REPOSITORY_ID (or event repository.id) must be a positive integer');
  }

  const headSha = pr?.head?.sha;
  if (!headSha) {
    throw new RunnerError('The event payload has no pull_request.head.sha');
  }

  const runId = positiveInt(env.GITHUB_RUN_ID);
  if (runId === null) {
    throw new RunnerError('GITHUB_RUN_ID must be a positive integer');
  }
  const runAttempt = positiveInt(env.GITHUB_RUN_ATTEMPT) ?? 1;

  return {
    owner,
    repo,
    prNumber,
    title: pr?.title ?? '',
    body: pr?.body ?? '',
    repositoryId,
    headSha,
    ...detectOrigin(env, event),
    runId,
    runAttempt,
  };
}
