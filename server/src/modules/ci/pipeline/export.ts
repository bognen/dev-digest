import { zipSync, strToU8 } from 'fflate';
import {
  CI_RUNNER_BUILD_COMMAND,
  CI_WORKFLOW_VERSION,
  ciAgentDir,
  ciCheckName,
  ciInstallBranch,
  ciManifestPath,
  ciWorkflowPath,
} from '@devdigest/shared';
import type {
  CiInstallInput,
  CiInstallation,
  CiInstallResult,
  CiPreview,
  CiPreviewFile,
  CiPreviewInput,
  CiSecretsStatus,
  CiZipInput,
  RepoRef,
} from '@devdigest/shared';
import {
  AppError,
  ConfigError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../../platform/errors.js';
import { OPENROUTER_SECRET_NAME, installPrBody, installPrTitle } from '../constants.js';
import {
  allocateSlug,
  containsSecret,
  isAllowedInstallBranch,
  secretStatusFromNames,
  slugify,
  timestampSuffix,
} from '../helpers.js';
import type {
  CiAgentLike,
  CiDeps,
  CiInstallationRecord,
  CiLatestRun,
  CiRepoRecord,
  CiSkillLike,
} from '../types.js';
import { buildFileSet, ciRunnerDir, isSameAgentManifest, syncDeletes } from './manifest.js';
import { generateWorkflow, lintWorkflow } from './workflow.js';

/**
 * Export orchestration: preview, secrets status, install-by-PR and zip.
 * Ports only (`CiDeps`); no adapters, no Drizzle. Every GitHub failure becomes
 * an `ExternalServiceError` with `{ operation, github_status }` and nothing is
 * persisted on failure (AC-28).
 */

// ---- shared helpers (also used by remove.ts) ----

export function githubStatusOf(err: unknown): number | undefined {
  if (err instanceof AppError) {
    const d = err.details as { github_status?: unknown } | undefined;
    return typeof d?.github_status === 'number' ? d.github_status : undefined;
  }
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Run one GitHub call; map any non-AppError failure to ExternalServiceError. */
export async function gh<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    const github_status = githubStatusOf(err);
    throw new ExternalServiceError(
      `${operation} failed${github_status != null ? ` (GitHub ${github_status})` : ''}`,
      { operation, github_status },
    );
  }
}

/** AC-82 / AC-92: every written or deleted path is the agent's own. */
export function assertOwnPaths(slug: string, paths: readonly string[]): void {
  const dir = ciAgentDir(slug);
  const workflow = ciWorkflowPath(slug);
  const bad = paths.filter((p) => p.includes('..') || !(p.startsWith(dir) || p === workflow));
  if (bad.length > 0) {
    throw new ValidationError('ci_path_outside_agent', { paths: bad });
  }
}

/** Domain record -> contract DTO. `latestRun` is filled by the service on reads. */
export function toInstallationDto(
  r: CiInstallationRecord,
  latestRun: CiLatestRun | null = null,
): CiInstallation {
  return {
    id: r.id,
    agent_id: r.agentId,
    repo_id: r.repoId,
    repo: r.repo,
    repo_github_id: r.repoGithubId,
    target_type: r.targetType,
    slug: r.slug,
    workflow_path: r.workflowPath,
    check_name: ciCheckName(r.slug),
    workflow_version: r.workflowVersion,
    branch: r.branch,
    pr_url: r.prUrl,
    pr_number: r.prNumber,
    pr_state: r.prState,
    status: r.status,
    removal_pr_url: r.removalPrUrl,
    exported_ci_fail_on: r.exportedCiFailOn,
    installed_at: r.installedAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    latest_run: latestRun
      ? { status: latestRun.status, ran_at: latestRun.ranAt.toISOString() }
      : null,
  };
}

export function prNumberFromUrl(url: string): number | null {
  const m = /\/pull\/(\d+)(?:$|[/?#])/.exec(url);
  return m ? Number(m[1]) : null;
}

// ---- preparation shared by preview / install / zip ----

interface Prepared {
  agent: CiAgentLike;
  repo: CiRepoRecord;
  ref: RepoRef;
  repoGithubId: number;
  defaultBranch: string;
  slug: string;
  files: CiPreviewFile[];
}

async function resolveSlug(
  deps: CiDeps,
  agent: CiAgentLike,
  repo: CiRepoRecord,
  ref: RepoRef,
  defaultBranch: string,
  existing: CiInstallationRecord | undefined,
): Promise<string> {
  // AC-83: a non-removed installation keeps its slug forever.
  if (existing && existing.status !== 'removed') return existing.slug;

  const ci = await deps.githubCi();
  const taken = new Set(await deps.store.listRepoSlugsInUse(repo.id, agent.id));
  const base = existing?.slug || slugify(agent.name) || 'agent';
  for (;;) {
    const candidate = allocateSlug(base, taken);
    const dirExists = await gh('check_path', () =>
      ci.pathExists(ref, ciAgentDir(candidate), defaultBranch),
    );
    const workflowExists = await gh('check_path', () =>
      ci.pathExists(ref, ciWorkflowPath(candidate), defaultBranch),
    );
    if (!dirExists && !workflowExists) return candidate;
    // A21: adopt the same agent's own folder (matched by studio_agent_id).
    const manifest = dirExists
      ? await gh('read_manifest', () =>
          ci.getFileText(ref, ciManifestPath(candidate), defaultBranch),
        )
      : null;
    if (manifest != null && isSameAgentManifest(manifest, agent.id)) return candidate;
    taken.add(candidate);
  }
}

async function prepare(
  deps: CiDeps,
  workspaceId: string,
  agentId: string,
  input: CiPreviewInput,
  workflowYaml: string | null,
): Promise<Prepared> {
  const agent = await deps.agents.getById(workspaceId, agentId);
  if (!agent) throw new NotFoundError('Agent not found');
  const repo = await deps.store.getRepo(workspaceId, input.repo_id);
  if (!repo) throw new NotFoundError('Repository not found');

  const runnerBundle = await deps.readRunnerBundle();
  if (runnerBundle == null || runnerBundle['index.js'] == null) {
    throw new ConfigError(
      `The agent runner has not been built. Run \`${CI_RUNNER_BUILD_COMMAND}\` and retry.`,
      { build_command: CI_RUNNER_BUILD_COMMAND },
    );
  }

  const existing = await deps.store.findInstallation(agent.id, repo.id);
  if (existing?.status === 'removal_pending') {
    throw new ConflictError('ci_removal_pending', { installation_id: existing.id });
  }

  const ref: RepoRef = { owner: repo.owner, name: repo.name };
  const ci = await deps.githubCi();
  const info = await gh('get_repository', () => ci.getRepository(ref));
  const slug = await resolveSlug(deps, agent, repo, ref, info.defaultBranch, existing);

  if (workflowYaml != null) {
    const lint = lintWorkflow(workflowYaml);
    if (lint.parseError) {
      throw new ValidationError(`Workflow YAML is invalid (line ${lint.parseError.line})`, {
        line: lint.parseError.line,
        message: lint.parseError.message,
      });
    }
  }
  const workflow =
    workflowYaml ??
    generateWorkflow({
      slug,
      triggers: input.triggers,
      postAs: input.post_as,
      version: CI_WORKFLOW_VERSION,
    });

  const linked = await deps.agents.linkedSkills(agent.id);
  const skills: CiSkillLike[] = [...linked].sort((a, b) => a.order - b.order).map((l) => l.skill);
  const memory = input.memory_export
    ? await deps.store.listMemoryForExport(workspaceId, repo.id)
    : null;

  const files = buildFileSet({
    slug,
    agent,
    skills,
    memory,
    workflowYaml: workflow,
    runnerBundle,
    hideRunnerContents: false,
  });
  if (containsSecret(files, await deps.studioSecretValues())) {
    throw new ValidationError('export_contains_secret');
  }

  return {
    agent,
    repo,
    ref,
    repoGithubId: info.id,
    defaultBranch: info.defaultBranch,
    slug,
    files,
  };
}

export async function previewExport(
  deps: CiDeps,
  workspaceId: string,
  agentId: string,
  input: CiPreviewInput,
): Promise<CiPreview> {
  const p = await prepare(deps, workspaceId, agentId, input, null);
  const runnerDir = ciRunnerDir(p.slug);
  return {
    repo_full_name: p.repo.fullName,
    default_branch: p.defaultBranch,
    slug: p.slug,
    workflow_path: ciWorkflowPath(p.slug),
    check_name: ciCheckName(p.slug),
    workflow_version: CI_WORKFLOW_VERSION,
    // A11: the runner bytes are never sent to the preview.
    files: p.files.map((f) => (f.path.startsWith(runnerDir) ? { ...f, contents: null } : f)),
  };
}

/** Names-only secret status; any listing failure degrades to `required` (AC-22). */
export async function secretsStatus(
  deps: CiDeps,
  workspaceId: string,
  agentId: string,
  repoId: string,
): Promise<CiSecretsStatus> {
  const agent = await deps.agents.getById(workspaceId, agentId);
  if (!agent) throw new NotFoundError('Agent not found');
  const repo = await deps.store.getRepo(workspaceId, repoId);
  if (!repo) throw new NotFoundError('Repository not found');
  let names: string[] | null;
  try {
    const ci = await deps.githubCi();
    names = await ci.listActionsSecretNames({ owner: repo.owner, name: repo.name });
  } catch {
    names = null;
  }
  return {
    openrouter_api_key: secretStatusFromNames(names, OPENROUTER_SECRET_NAME),
    github_token: 'provided',
  };
}

export async function installExport(
  deps: CiDeps,
  workspaceId: string,
  agentId: string,
  input: CiInstallInput,
): Promise<CiInstallResult> {
  const p = await prepare(deps, workspaceId, agentId, input, input.workflow_yaml);
  const { slug, ref, repo } = p;
  let branch = ciInstallBranch(slug);
  const log = (outcome: string, extra: Record<string, unknown> = {}): void =>
    deps.logger.info(
      {
        event: 'ci.export',
        agent_id: agentId,
        slug,
        repo: repo.fullName,
        branch,
        outcome,
        ...extra,
      },
      'ci export',
    );

  try {
    if (input.branch && isAllowedInstallBranch(slug, input.branch)) branch = input.branch;

    const client = await deps.github();
    const ci = await deps.githubCi();

    const defaultHead = await gh('get_branch', () => ci.getBranchSha(ref, p.defaultBranch));
    if (!defaultHead) {
      throw new ExternalServiceError('get_branch failed (GitHub 404)', {
        operation: 'get_branch',
        github_status: 404,
      });
    }
    const branchHead = await gh('get_branch', () => ci.getBranchSha(ref, branch));

    let reusedPr: { url: string; number: number | null } | null = null;
    if (branchHead) {
      const open = await gh('find_open_pr', () => client.findOpenPr(ref, branch));
      if (!open) {
        throw new ConflictError('ci_branch_exists', {
          branch,
          suggested_branch: `${ciInstallBranch(slug)}-${timestampSuffix(deps.now())}`,
        });
      }
      reusedPr = open;
    }

    const parent = branchHead ?? defaultHead;
    const existingPaths = await gh('list_tree', () =>
      ci.listTreePaths(ref, parent, ciAgentDir(slug)),
    );
    const newPaths = p.files.map((f) => f.path);
    const deletePaths = syncDeletes(slug, existingPaths, newPaths);
    assertOwnPaths(slug, [...newPaths, ...deletePaths]);

    await gh('commit_files', () =>
      client.commitFiles(ref, {
        branch,
        base: p.defaultBranch,
        message: installPrTitle(p.agent.name),
        files: p.files.map((f) => ({ path: f.path, contents: f.contents ?? '' })),
        deletePaths,
      }),
    );

    let prUrl: string;
    let prNumber: number | null;
    if (reusedPr) {
      prUrl = reusedPr.url;
      prNumber = reusedPr.number;
    } else {
      const opened = await gh('open_pull_request', () =>
        client.openPullRequest(ref, {
          title: installPrTitle(p.agent.name),
          head: branch,
          base: p.defaultBranch,
          body: installPrBody({
            agentName: p.agent.name,
            slug,
            fileCount: p.files.length,
          }),
        }),
      );
      prUrl = opened.url;
      prNumber = prNumberFromUrl(opened.url);
    }

    const installation = await deps.store.upsertInstallation({
      workspaceId,
      agentId,
      repoId: repo.id,
      repo: repo.fullName,
      repoGithubId: p.repoGithubId,
      slug,
      workflowPath: ciWorkflowPath(slug),
      workflowVersion: CI_WORKFLOW_VERSION,
      branch,
      prUrl,
      prNumber,
      prState: 'open',
      exportedCiFailOn: p.agent.ciFailOn,
    });
    log(reusedPr ? 'pr_reused' : 'pr_opened');
    return {
      installation: toInstallationDto(installation),
      pr_url: prUrl,
      branch,
      reused_pr: reusedPr != null,
    };
  } catch (err) {
    log(err instanceof ConflictError ? 'branch_exists' : 'failed', {
      github_status: githubStatusOf(err),
    });
    throw err;
  }
}

/** Zip of the same file set. No GitHub write and no installation (D-15). */
export async function zipExport(
  deps: CiDeps,
  workspaceId: string,
  agentId: string,
  input: CiZipInput,
): Promise<Uint8Array> {
  // AC-7: a hand-edited workflow is honoured (same size cap + lint as install).
  const p = await prepare(deps, workspaceId, agentId, input, input.workflow_yaml ?? null);
  const entries: Record<string, Uint8Array> = {};
  for (const f of p.files) entries[f.path] = strToU8(f.contents ?? '');
  deps.logger.info(
    {
      event: 'ci.export',
      agent_id: agentId,
      slug: p.slug,
      repo: p.repo.fullName,
      branch: null,
      outcome: 'zip',
    },
    'ci export',
  );
  return zipSync(entries);
}
