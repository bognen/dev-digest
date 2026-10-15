import path from 'node:path';
import { unzipSync } from 'fflate';
import { CI_ARTIFACT_PREFIX, CI_RESULT_MAX_BYTES, CiResultArtifact } from '@devdigest/shared';
import type {
  CiRefreshResult,
  CiRejectReason,
  CiRunArtifact,
  CiWorkflowRun,
  GitHubCiClient,
  RepoRef,
} from '@devdigest/shared';
import { CI_RUNS_PAGE_SIZE } from '../constants.js';
import type {
  CiAgentLike,
  CiDeps,
  CiInstallationRecord,
  CiPrState,
  CiRunKey,
} from '../types.js';
import { baseShaFor, decideIngest, expectedArtifactName } from './ingest-validate.js';
import type { IngestDecision, IngestEvidence } from './ingest-validate.js';
import { nextInstallStatusFromRemovalPr } from './lifecycle.js';

/**
 * Pull-only ingest orchestration (ring 3). Reaches GitHub and the DB only through the
 * ports in `CiDeps`; every accept/reject decision is the pure `decideIngest`.
 * Fail closed: any evidence that cannot be gathered is a rejection or a retry, never an accept.
 */

const RESULT_FILE = 'devdigest-result.json';
const FULL_SHA = /^[0-9a-f]{40}$/;
/** `skipped_files` is PR-controlled: bound it before it is stored. */
const MAX_SKIPPED_FILES = 50;
const MAX_SKIPPED_PATH_LENGTH = 200;
const MAX_SEEN_FOREIGN = 5_000;
const MAX_ERROR_LENGTH = 300;

type Outcome = 'accepted' | 'failed' | 'skipped' | 'result_expired' | CiRejectReason;

export interface IngestService {
  refresh(workspaceId: string): Promise<CiRefreshResult>;
}

const emptyResult = (): CiRefreshResult => ({
  accepted: 0,
  rejected: 0,
  failed: 0,
  skipped: 0,
  result_expired: 0,
  removed: 0,
  reactivated: 0,
  errors: [],
});

function splitRepo(fullName: string): RepoRef {
  const [owner = '', name = ''] = fullName.split('/');
  return { owner, name };
}

/** Strip control characters and cap the length of a PR-controlled string. */
function cleanPath(p: string): string {
  // eslint-disable-next-line no-control-regex
  return p.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, MAX_SKIPPED_PATH_LENGTH);
}

export function boundSkippedFiles(files: readonly string[]): string[] {
  return files.slice(0, MAX_SKIPPED_FILES).map(cleanPath);
}

function errMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.slice(0, MAX_ERROR_LENGTH);
}

export function createIngestService(deps: CiDeps): IngestService {
  const inFlight = new Map<string, Promise<CiRefreshResult>>();
  /** Process-local "already logged" set for foreign-workflow runs (A19). */
  const seenForeign = new Set<string>();

  function logForeign(repo: string, run: CiWorkflowRun, workflowPath: string | null): void {
    const key = `${repo}:${run.id}`;
    if (seenForeign.has(key)) return;
    if (seenForeign.size >= MAX_SEEN_FOREIGN) seenForeign.clear();
    seenForeign.add(key);
    deps.logger.info(
      {
        event: 'ci.ingest',
        repo,
        workflow_path: workflowPath ?? run.path,
        workflow_run_id: run.id,
        run_attempt: run.runAttempt,
        outcome: 'foreign_workflow',
      },
      'ci ingest',
    );
  }

  /** Reads and inflates the result file; the zip-bomb guard runs before inflating. */
  function readResult(zip: Uint8Array): { originalSize: number | null; json: string | null } {
    let originalSize: number | null = null;
    try {
      const files = unzipSync(zip, {
        filter: (f) => {
          if (f.name !== RESULT_FILE) return false;
          originalSize = f.originalSize;
          return f.originalSize <= CI_RESULT_MAX_BYTES;
        },
      });
      const bytes = files[RESULT_FILE];
      return {
        originalSize,
        json: bytes ? new TextDecoder('utf-8').decode(bytes) : null,
      };
    } catch {
      return { originalSize, json: null };
    }
  }

  async function gatherEvidence(
    gh: GitHubCiClient,
    repo: RepoRef,
    inst: CiInstallationRecord,
    run: CiWorkflowRun,
  ): Promise<IngestEvidence> {
    const artifacts: CiRunArtifact[] = await gh.listRunArtifacts(repo, run.id);
    const artifact =
      artifacts.find((a) => a.name === expectedArtifactName({ ...inst, slug: inst.slug })) ?? null;
    const evidence: IngestEvidence = {
      artifact,
      originalSize: null,
      json: null,
      headBlobSha: null,
      baseBlobSha: null,
    };
    if (!artifact || artifact.expired || artifact.sizeInBytes > CI_RESULT_MAX_BYTES) {
      return evidence;
    }
    const { originalSize, json } = readResult(await gh.downloadArtifactZip(repo, artifact.id));
    evidence.originalSize = originalSize;
    evidence.json = json;
    if (json === null) return evidence;

    // Blob SHAs are only needed once the artifact parses; the PR number is read from it
    // only to pick the API base SHA (the decision re-validates everything).
    let prNumber: number | null = null;
    try {
      const peek = CiResultArtifact.safeParse(JSON.parse(json));
      if (peek.success) prNumber = peek.data.pr_number;
    } catch {
      /* decideIngest rejects as `schema` */
    }
    const baseSha = prNumber === null ? null : baseShaFor(run, prNumber);
    if (baseSha && FULL_SHA.test(baseSha) && FULL_SHA.test(run.headSha)) {
      evidence.headBlobSha = await gh.getFileBlobSha(repo, inst.workflowPath, run.headSha);
      evidence.baseBlobSha = await gh.getFileBlobSha(repo, inst.workflowPath, baseSha);
    }
    return evidence;
  }

  function baseKey(
    inst: CiInstallationRecord,
    agent: CiAgentLike | undefined,
    run: CiWorkflowRun,
    prNumber: number | null,
  ): CiRunKey {
    return {
      workspaceId: inst.workspaceId,
      installationId: inst.id,
      repoId: inst.repoId,
      repoFullName: inst.repo,
      repoGithubId: inst.repoGithubId,
      workflowPath: inst.workflowPath,
      agentSlug: inst.slug,
      agentId: agent?.id ?? inst.agentId,
      agentName: agent?.name ?? null,
      workflowRunId: run.id,
      runAttempt: run.runAttempt,
      headSha: run.headSha,
      prNumber,
      ranAt: new Date(run.createdAt),
    };
  }

  async function persist(
    inst: CiInstallationRecord,
    agent: CiAgentLike | undefined,
    run: CiWorkflowRun,
    decision: Exclude<IngestDecision, { kind: 'skip' }>,
    result: CiRefreshResult,
  ): Promise<void> {
    let outcome: Outcome;
    let prNumber: number | null = run.pullRequests[0]?.number ?? null;
    let inserted: boolean;

    if (decision.kind === 'accepted') {
      const a = decision.artifact;
      prNumber = a.pr_number;
      outcome = 'accepted';
      inserted = await deps.store.insertAcceptedRun({
        ...baseKey(inst, agent, run, prNumber),
        agentId: inst.agentId,
        // Provider / model come from the studio agent, never from the artifact.
        provider: agent?.provider ?? null,
        model: agent?.model ?? null,
        verdict: a.verdict,
        findingsCount: a.findings_count,
        critical: a.critical,
        warning: a.warning,
        suggestion: a.suggestion,
        blockers: a.blockers,
        costUsd: a.cost_usd,
        durationMs: a.duration_ms,
        partial: a.partial,
        skippedFiles: boundSkippedFiles(a.skipped_files),
        version: a.version,
        status: decision.status,
      });
      if (inserted) result.accepted += 1;
    } else if (decision.kind === 'rejected') {
      outcome = decision.reason;
      inserted = await deps.store.insertNonAcceptedRun({
        ...baseKey(inst, agent, run, prNumber),
        status: 'rejected',
        reason: decision.reason,
      });
      if (inserted) result.rejected += 1;
    } else {
      outcome = decision.kind;
      inserted = await deps.store.insertNonAcceptedRun({
        ...baseKey(inst, agent, run, prNumber),
        status: decision.kind,
        reason: null,
      });
      if (inserted) result[decision.kind] += 1;
    }

    if (inserted) {
      deps.logger.info(
        {
          event: 'ci.ingest',
          repo: inst.repo,
          repo_github_id: inst.repoGithubId,
          workflow_path: inst.workflowPath,
          slug: inst.slug,
          pr_number: prNumber,
          head_sha: run.headSha,
          workflow_run_id: run.id,
          run_attempt: run.runAttempt,
          outcome,
        },
        'ci ingest',
      );
    }
  }

  async function ingestInstallation(
    gh: GitHubCiClient,
    repo: RepoRef,
    inst: CiInstallationRecord,
    stored: Set<string>,
    result: CiRefreshResult,
  ): Promise<void> {
    const runs = await gh.listWorkflowRuns(repo, path.posix.basename(inst.workflowPath), {
      perPage: CI_RUNS_PAGE_SIZE,
    });
    const agent = await deps.agents.getById(inst.workspaceId, inst.agentId);
    const agentActive = !!agent && agent.enabled;

    for (const run of runs.slice(0, CI_RUNS_PAGE_SIZE)) {
      if (run.path !== inst.workflowPath) {
        logForeign(inst.repo, run, inst.workflowPath);
        continue;
      }
      if (run.status !== 'completed') continue;
      if (stored.has(`${run.id}:${run.runAttempt}`)) continue;
      try {
        const evidence = await gatherEvidence(gh, repo, inst, run);
        const decision = decideIngest({
          installation: inst,
          repoFullName: inst.repo,
          run,
          agentActive,
          evidence,
        });
        if (decision.kind === 'skip') continue;
        await persist(inst, agent, run, decision, result);
        stored.add(`${run.id}:${run.runAttempt}`);
      } catch (e) {
        // Transient GitHub failure: nothing stored, retried on the next refresh.
        result.errors.push(`${inst.repo} run ${run.id}: ${errMessage(e)}`);
      }
    }
  }

  async function syncInstallPr(
    gh: GitHubCiClient,
    repo: RepoRef,
    inst: CiInstallationRecord,
  ): Promise<void> {
    if (inst.prState !== 'open' || inst.prNumber === null) return;
    const s = await gh.getPullState(repo, inst.prNumber);
    const next: CiPrState = s.merged ? 'merged' : s.state === 'closed' ? 'closed' : 'open';
    if (next !== inst.prState) await deps.store.updatePrState(inst.id, next);
  }

  async function settleRemoval(
    gh: GitHubCiClient,
    repo: RepoRef,
    inst: CiInstallationRecord,
    result: CiRefreshResult,
  ): Promise<void> {
    if (inst.status !== 'removal_pending' || inst.removalPrNumber === null) return;
    const s = await gh.getPullState(repo, inst.removalPrNumber);
    const next = nextInstallStatusFromRemovalPr(s.state, s.merged);
    if (next === 'removed') {
      await deps.store.markRemoved(inst.id);
      result.removed += 1;
    } else if (next === 'active') {
      await deps.store.reactivate(inst.id);
      result.reactivated += 1;
    }
  }

  async function scanForeign(
    gh: GitHubCiClient,
    repo: RepoRef,
    fullName: string,
    insts: CiInstallationRecord[],
  ): Promise<void> {
    const owned = new Set(insts.map((i) => i.workflowPath));
    const runs = await gh.listRepoWorkflowRuns(repo, { perPage: CI_RUNS_PAGE_SIZE });
    for (const run of runs.slice(0, CI_RUNS_PAGE_SIZE)) {
      if (owned.has(run.path) || seenForeign.has(`${fullName}:${run.id}`)) continue;
      const artifacts = await gh.listRunArtifacts(repo, run.id);
      if (artifacts.some((a) => a.name.startsWith(CI_ARTIFACT_PREFIX))) {
        logForeign(fullName, run, null);
      }
    }
  }

  async function ingestRepo(
    gh: GitHubCiClient,
    insts: CiInstallationRecord[],
    stored: Set<string>,
    result: CiRefreshResult,
  ): Promise<void> {
    const fullName = insts[0]!.repo;
    const repo = splitRepo(fullName);

    for (const inst of insts) {
      try {
        await syncInstallPr(gh, repo, inst);
      } catch (e) {
        result.errors.push(`${fullName} install PR: ${errMessage(e)}`);
      }
    }
    for (const inst of insts) {
      try {
        await ingestInstallation(gh, repo, inst, stored, result);
      } catch (e) {
        result.errors.push(`${fullName} ${inst.slug}: ${errMessage(e)}`);
        // Do not settle a removal whose runs could not be ingested (AC-96).
        continue;
      }
      try {
        await settleRemoval(gh, repo, inst, result);
      } catch (e) {
        result.errors.push(`${fullName} removal PR: ${errMessage(e)}`);
      }
    }
    try {
      await scanForeign(gh, repo, fullName, insts);
    } catch (e) {
      result.errors.push(`${fullName} foreign scan: ${errMessage(e)}`);
    }
  }

  async function doRefresh(workspaceId: string): Promise<CiRefreshResult> {
    const result = emptyResult();
    const pollable = await deps.store.listPollableInstallations(workspaceId);
    if (pollable.length === 0) return result;
    const gh = await deps.githubCi();
    const stored = await deps.store.existingRunKeys(workspaceId);

    const byRepo = new Map<string, CiInstallationRecord[]>();
    for (const inst of pollable) {
      const list = byRepo.get(inst.repoId) ?? [];
      list.push(inst);
      byRepo.set(inst.repoId, list);
    }
    for (const insts of byRepo.values()) {
      try {
        await ingestRepo(gh, insts, stored, result);
      } catch (e) {
        result.errors.push(`${insts[0]!.repo}: ${errMessage(e)}`);
      }
    }
    return result;
  }

  return {
    /** One in-flight refresh per workspace; concurrent callers share its promise. */
    refresh(workspaceId: string): Promise<CiRefreshResult> {
      const existing = inFlight.get(workspaceId);
      if (existing) return existing;
      const p = doRefresh(workspaceId).finally(() => {
        inFlight.delete(workspaceId);
      });
      inFlight.set(workspaceId, p);
      return p;
    },
  };
}
