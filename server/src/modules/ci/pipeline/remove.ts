import { ciAgentDir, ciRemovalBranch, ciWorkflowPath } from '@devdigest/shared';
import type { CiRemoveInput, CiRemoveResult } from '@devdigest/shared';
import { ConflictError, NotFoundError } from '../../../platform/errors.js';
import { removalPrBody, removalPrTitle } from '../constants.js';
import { isAllowedRemovalBranch, timestampSuffix } from '../helpers.js';
import type { CiDeps } from '../types.js';
import {
  assertOwnPaths,
  gh,
  githubStatusOf,
  prNumberFromUrl,
  toInstallationDto,
} from './export.js';
import { planRemoval } from './lifecycle.js';

/**
 * "Remove from CI" orchestration (D-34): a deletion-only PR on
 * `devdigest/ci-<slug>-remove`, or a direct `removed` when nothing was ever merged.
 * Touches only the agent's own paths (AC-92). A GitHub failure leaves the
 * installation status unchanged (AC-99).
 */
export async function removeFromCi(
  deps: CiDeps,
  workspaceId: string,
  agentId: string,
  installationId: string,
  input: CiRemoveInput,
): Promise<CiRemoveResult> {
  const inst = await deps.store.getInstallation(workspaceId, installationId);
  if (!inst || inst.agentId !== agentId) throw new NotFoundError('CI installation not found');
  if (inst.status !== 'active') {
    throw new ConflictError('ci_installation_not_active', { status: inst.status });
  }
  const agent = await deps.agents.getById(workspaceId, agentId);
  if (!agent) throw new NotFoundError('Agent not found');
  const repo = await deps.store.getRepo(workspaceId, inst.repoId);
  if (!repo) throw new NotFoundError('Repository not found');

  const slug = inst.slug;
  const ref = { owner: repo.owner, name: repo.name };
  let branch = ciRemovalBranch(slug);
  const log = (outcome: string, extra: Record<string, unknown> = {}): void =>
    deps.logger.info(
      {
        event: 'ci.remove',
        agent_id: agentId,
        slug,
        repo: repo.fullName,
        branch,
        outcome,
        ...extra,
      },
      'ci remove',
    );

  const reload = async () => {
    const fresh = await deps.store.getInstallation(workspaceId, inst.id);
    return toInstallationDto(fresh ?? inst);
  };

  try {
    if (input?.branch && isAllowedRemovalBranch(slug, input.branch)) branch = input.branch;

    const client = await deps.github();
    const ci = await deps.githubCi();
    const info = await gh('get_repository', () => ci.getRepository(ref));
    const defaultHead = await gh('get_branch', () => ci.getBranchSha(ref, info.defaultBranch));

    let present: string[] = [];
    if (defaultHead) {
      present = await gh('list_tree', () => ci.listTreePaths(ref, defaultHead, ciAgentDir(slug)));
      const workflowBlob = await gh('get_file', () =>
        ci.getFileBlobSha(ref, ciWorkflowPath(slug), defaultHead),
      );
      if (workflowBlob) present = [...present, ciWorkflowPath(slug)];
    }
    const plan = planRemoval(slug, present);

    if (plan.kind === 'removed_directly') {
      let installPrUrl: string | null = null;
      if (inst.prNumber != null && inst.prUrl) {
        const prNumber = inst.prNumber;
        const state = await gh('get_pull', () => ci.getPullState(ref, prNumber));
        if (state.state === 'open') installPrUrl = inst.prUrl;
      }
      await deps.store.markRemoved(inst.id);
      log('removed_directly');
      return {
        installation: await reload(),
        outcome: 'removed_directly',
        pr_url: null,
        install_pr_url: installPrUrl,
      };
    }

    assertOwnPaths(slug, plan.deletePaths);

    const branchHead = await gh('get_branch', () => ci.getBranchSha(ref, branch));
    if (branchHead) {
      const open = await gh('find_open_pr', () => client.findOpenPr(ref, branch));
      if (!open) {
        throw new ConflictError('ci_branch_exists', {
          branch,
          suggested_branch: `${ciRemovalBranch(slug)}-${timestampSuffix(deps.now())}`,
        });
      }
      await deps.store.setRemovalPending(inst.id, {
        branch,
        prUrl: open.url,
        prNumber: open.number,
      });
      log('removal_pr_reused');
      return {
        installation: await reload(),
        outcome: 'removal_pr_reused',
        pr_url: open.url,
        install_pr_url: null,
      };
    }

    await gh('commit_files', () =>
      client.commitFiles(ref, {
        branch,
        base: info.defaultBranch,
        message: removalPrTitle(agent.name),
        files: [],
        deletePaths: plan.deletePaths,
      }),
    );
    const opened = await gh('open_pull_request', () =>
      client.openPullRequest(ref, {
        title: removalPrTitle(agent.name),
        head: branch,
        base: info.defaultBranch,
        body: removalPrBody({ agentName: agent.name, slug }),
      }),
    );
    const prNumber = prNumberFromUrl(opened.url);
    if (prNumber == null) {
      throw new ConflictError('ci_removal_pr_number_unknown', { pr_url: opened.url });
    }
    await deps.store.setRemovalPending(inst.id, { branch, prUrl: opened.url, prNumber });
    log('removal_pr_opened');
    return {
      installation: await reload(),
      outcome: 'removal_pr_opened',
      pr_url: opened.url,
      install_pr_url: null,
    };
  } catch (err) {
    log(err instanceof ConflictError ? 'conflict' : 'failed', {
      github_status: githubStatusOf(err),
    });
    throw err;
  }
}
