import { CI_RESULT_MAX_BYTES, CiResultArtifact, ciArtifactName } from '@devdigest/shared';
import type {
  CiRejectReason,
  CiRunArtifact,
  CiWorkflowRun,
} from '@devdigest/shared';

/**
 * One pure ingest decision per workflow run. The run has already been attributed by its
 * API `path` to exactly one active / removal-pending installation (AC-90); the artifact's
 * own `agent` / `agent_slug` never affect attribution. Fail closed: anything unexpected
 * is a rejection, never an acceptance.
 */

export const DEPENDABOT_ACTOR = 'dependabot[bot]';
const FULL_SHA = /^[0-9a-f]{40}$/;

export interface IngestInstallation {
  slug: string;
  repoGithubId: number;
  workflowPath: string;
}

export interface IngestEvidence {
  /** The `devdigest-result-<slug>` artifact listed for this run, if any. */
  artifact: CiRunArtifact | null;
  /** Uncompressed size of the JSON entry in the zip (checked before inflating). */
  originalSize: number | null;
  /** Raw JSON text of the result file; null when missing / not read. */
  json: string | null;
  /** Blob SHA of the workflow file at the run's head SHA / API base SHA (null = missing). */
  headBlobSha: string | null;
  baseBlobSha: string | null;
}

export interface IngestInput {
  installation: IngestInstallation;
  repoFullName: string;
  run: CiWorkflowRun;
  /** The studio agent exists and is enabled. */
  agentActive: boolean;
  evidence: IngestEvidence;
}

export type IngestDecision =
  | { kind: 'skip' }
  | { kind: 'failed' }
  | { kind: 'skipped' }
  | { kind: 'result_expired' }
  | { kind: 'rejected'; reason: CiRejectReason }
  | { kind: 'accepted'; artifact: CiResultArtifact; status: 'succeeded' | 'no_findings' };

/** API-data fork / Dependabot detection (D-28): the artifact is never consulted. */
export function isForkOrDependabot(run: CiWorkflowRun, repoFullName: string): boolean {
  return (
    run.headRepoFullName === null ||
    run.headRepoFullName !== repoFullName ||
    run.triggeringActor === DEPENDABOT_ACTOR
  );
}

/** Base SHA reported by the API for the run's PR (A14); null when unknown. */
export function baseShaFor(run: CiWorkflowRun, prNumber: number): string | null {
  return run.pullRequests.find((p) => p.number === prNumber)?.baseSha ?? null;
}

/** Artifact name this installation's runs must carry. */
export function expectedArtifactName(installation: IngestInstallation): string {
  return ciArtifactName(installation.slug);
}

export function decideIngest(input: IngestInput): IngestDecision {
  const { installation, run, evidence } = input;

  // 1. Only completed runs are ingested.
  if (run.status !== 'completed') return { kind: 'skip' };

  // 2. No artifact: skipped (fork / Dependabot, from API data) or failed.
  if (!evidence.artifact || evidence.artifact.name !== expectedArtifactName(installation)) {
    return isForkOrDependabot(run, input.repoFullName) ? { kind: 'skipped' } : { kind: 'failed' };
  }

  // 3. Expired artifact.
  if (evidence.artifact.expired) return { kind: 'result_expired' };

  // 4. Agent deleted or disabled.
  if (!input.agentActive) return { kind: 'rejected', reason: 'agent_inactive' };

  // 5. Size caps (listing size and zip entry size).
  if (
    evidence.artifact.sizeInBytes > CI_RESULT_MAX_BYTES ||
    (evidence.originalSize ?? 0) > CI_RESULT_MAX_BYTES
  ) {
    return { kind: 'rejected', reason: 'too_large' };
  }

  // 6. Schema.
  if (evidence.json === null) return { kind: 'rejected', reason: 'schema' };
  let raw: unknown;
  try {
    raw = JSON.parse(evidence.json);
  } catch {
    return { kind: 'rejected', reason: 'schema' };
  }
  const parsed = CiResultArtifact.safeParse(raw);
  if (!parsed.success) return { kind: 'rejected', reason: 'schema' };
  const artifact = parsed.data;

  // 7. Repository identity.
  if (artifact.repository_id !== installation.repoGithubId) {
    return { kind: 'rejected', reason: 'repository_mismatch' };
  }

  // 8. Head SHA + run identity + PR number must match the API data (A3).
  if (
    !FULL_SHA.test(artifact.head_sha) ||
    artifact.head_sha !== run.headSha ||
    artifact.workflow_run_id !== run.id ||
    artifact.workflow_run_attempt !== run.runAttempt ||
    !run.pullRequests.some((p) => p.number === artifact.pr_number)
  ) {
    return { kind: 'rejected', reason: 'sha_mismatch' };
  }

  // 9. The workflow file must be unchanged between the PR base and head (AC-74).
  const baseSha = baseShaFor(run, artifact.pr_number);
  if (
    baseSha === null ||
    evidence.headBlobSha === null ||
    evidence.baseBlobSha === null ||
    evidence.headBlobSha !== evidence.baseBlobSha
  ) {
    return { kind: 'rejected', reason: 'workflow_modified' };
  }

  return {
    kind: 'accepted',
    artifact,
    status: artifact.findings_count === 0 ? 'no_findings' : 'succeeded',
  };
}
