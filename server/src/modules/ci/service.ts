import { CI_WORKFLOW_VERSION } from '@devdigest/shared';
import type {
  CiAgentOverview,
  CiInstallInput,
  CiInstallResult,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRemoveInput,
  CiRemoveResult,
  CiRun,
  CiSecretsStatus,
  CiZipInput,
} from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { isActiveRepo } from './helpers.js';
import {
  installExport,
  previewExport,
  secretsStatus,
  toInstallationDto,
  zipExport,
} from './pipeline/export.js';
import { createIngestService } from './pipeline/ingest.js';
import type { IngestService } from './pipeline/ingest.js';
import { removeFromCi } from './pipeline/remove.js';
import type { CiDeps, CiRunRecord } from './types.js';

/** Run record (domain) -> contract DTO. */
export function toRunDto(r: CiRunRecord): CiRun {
  return {
    id: r.id,
    status: r.status ?? 'failed',
    reason: r.reason,
    ran_at: (r.ranAt ?? new Date(0)).toISOString(),
    repo: r.repoFullName,
    pr_number: r.prNumber,
    head_sha: r.headSha,
    agent_id: r.agentId,
    agent_name: r.agentName,
    agent_slug: r.agentSlug,
    installation_status: r.installationStatus,
    verdict: r.verdict,
    findings_count: r.findingsCount,
    critical: r.critical,
    warning: r.warning,
    suggestion: r.suggestion,
    blockers: r.blockers,
    cost_usd: r.costUsd,
    duration_ms: r.durationMs,
    partial: r.partial,
    skipped_count: r.skippedFiles.length,
    run_url: r.runUrl,
    workflow_run_id: r.workflowRunId,
    run_attempt: r.runAttempt,
    version: r.version,
  };
}

/**
 * CI application service (ring 3): a thin facade over the export / remove / ingest
 * pipelines plus the read models. Built ONCE by the Container: the ingest service owns
 * the per-workspace refresh guard and the foreign-run seen-set. No result-accepting
 * entry point exists (AC-43): runs only enter through the pull-only `refresh`.
 */
export class CiService {
  private readonly ingest: IngestService;

  constructor(private readonly deps: CiDeps) {
    this.ingest = createIngestService(deps);
  }

  preview(workspaceId: string, agentId: string, input: CiPreviewInput): Promise<CiPreview> {
    return previewExport(this.deps, workspaceId, agentId, input);
  }

  secrets(workspaceId: string, agentId: string, repoId: string): Promise<CiSecretsStatus> {
    return secretsStatus(this.deps, workspaceId, agentId, repoId);
  }

  install(workspaceId: string, agentId: string, input: CiInstallInput): Promise<CiInstallResult> {
    return installExport(this.deps, workspaceId, agentId, input);
  }

  zip(workspaceId: string, agentId: string, input: CiZipInput): Promise<Uint8Array> {
    return zipExport(this.deps, workspaceId, agentId, input);
  }

  remove(
    workspaceId: string,
    agentId: string,
    installationId: string,
    input: CiRemoveInput,
  ): Promise<CiRemoveResult> {
    return removeFromCi(this.deps, workspaceId, agentId, installationId, input);
  }

  refresh(workspaceId: string): Promise<CiRefreshResult> {
    return this.ingest.refresh(workspaceId);
  }

  async listRuns(workspaceId: string): Promise<CiRun[]> {
    const runs = await this.deps.store.listRuns(workspaceId);
    return runs.map(toRunDto);
  }

  /** `GET /agents/:id/ci` — installations (with latest run), active-repo count, run history. */
  async overview(workspaceId: string, agentId: string): Promise<CiAgentOverview> {
    const { store, agents } = this.deps;
    const agent = await agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const [installations, latest, accepted, runs] = await Promise.all([
      store.listInstallationsForAgent(workspaceId, agentId),
      store.latestRunPerInstallation(workspaceId),
      store.acceptedRunCountsByInstallation(workspaceId),
      store.listRuns(workspaceId, { agentId }),
    ]);
    return {
      installations: installations.map((i) => toInstallationDto(i, latest.get(i.id) ?? null)),
      active_repos: installations.filter((i) => isActiveRepo(i, accepted.get(i.id) ?? 0)).length,
      current_workflow_version: CI_WORKFLOW_VERSION,
      runs: runs.map(toRunDto),
    };
  }
}
