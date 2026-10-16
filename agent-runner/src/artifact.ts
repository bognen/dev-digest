import type { Finding } from '@devdigest/shared';
import { CiResultArtifact, CI_WORKFLOW_VERSION } from '@devdigest/shared';
import { RunnerError } from './errors.js';

export interface BuildResultArtifactInput {
  findings: Finding[];
  costUsd: number | null;
  durationMs: number;
  agent: string;
  agentSlug: string;
  prNumber: number;
  repositoryId: number;
  repository: string;
  headSha: string;
  workflowRunId: number;
  workflowRunAttempt: number;
  /** The deterministic GitHub review event (never the model's verdict). */
  verdict: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';
  blockers: number;
  partial: boolean;
  skippedFiles: string[];
}

function severityCounts(findings: Finding[]): { critical: number; warning: number; suggestion: number } {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

/**
 * Build + validate the `devdigest-result.json` artifact (AC-41): exactly the
 * strict `CiResultArtifact` allowlist — no secrets, no free text. Validated with
 * the SAME schema the studio's ingest path uses, so a malformed artifact fails
 * loudly here rather than silently on ingest.
 */
export function buildResultArtifact(input: BuildResultArtifactInput): CiResultArtifact {
  const counts = severityCounts(input.findings);
  const candidate = {
    repository_id: input.repositoryId,
    repository: input.repository,
    pr_number: input.prNumber,
    head_sha: input.headSha,
    workflow_run_id: input.workflowRunId,
    workflow_run_attempt: input.workflowRunAttempt,
    agent: input.agent,
    agent_slug: input.agentSlug,
    version: String(CI_WORKFLOW_VERSION),
    verdict: input.verdict,
    findings_count: input.findings.length,
    critical: counts.critical,
    warning: counts.warning,
    suggestion: counts.suggestion,
    blockers: input.blockers,
    cost_usd: input.costUsd,
    duration_ms: Math.round(input.durationMs),
    partial: input.partial,
    skipped_files: input.skippedFiles,
  };
  const result = CiResultArtifact.safeParse(candidate);
  if (!result.success) {
    throw new RunnerError(
      `Internal error: built result artifact failed CiResultArtifact validation: ${result.error.message}`,
    );
  }
  return result.data;
}
