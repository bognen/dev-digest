import type {
  EvalCaseDetail,
  EvalCaseFile,
  EvalCaseLastResult,
  EvalCaseMeta,
  EvalCaseResult,
  EvalConfigSnapshot,
  EvalExpectedOutput,
  EvalMetricDelta,
  EvalRunPoint,
  EvalSuiteRun,
  EvalVacuous,
  Finding,
} from '@devdigest/shared';
import { ALERT_MIN_DROP } from './constants.js';
import type { EvalCaseRow, EvalResultRow, EvalSuiteRunRow } from './repository.js';

/** Row ↔ DTO mapping and small pure derivations for the eval module. */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function expectedOf(json: unknown): EvalExpectedOutput {
  const v = json as Partial<EvalExpectedOutput> | null;
  return { expectations: Array.isArray(v?.expectations) ? v!.expectations : [] };
}

export function filesOf(json: unknown): EvalCaseFile[] {
  return Array.isArray(json) ? (json as EvalCaseFile[]) : [];
}

export function metaOf(json: unknown): EvalCaseMeta {
  const v = (json ?? {}) as Partial<EvalCaseMeta>;
  return { pr_title: v.pr_title ?? '', pr_body: v.pr_body ?? '', source: v.source ?? null };
}

interface ActualOutput {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
  matched: string[];
  unmatched: string[];
}

function actualOf(json: unknown): ActualOutput {
  const v = (json ?? {}) as Partial<ActualOutput>;
  return { kept: v.kept ?? [], dropped: v.dropped ?? [], matched: v.matched ?? [], unmatched: v.unmatched ?? [] };
}

export function lastResultToDto(r: EvalResultRow): EvalCaseLastResult {
  const expected = expectedOf(r.expectedSnapshot);
  return {
    status: (r.status ?? (r.pass ? 'pass' : 'fail')) as EvalCaseLastResult['status'],
    expected_findings: expected.expectations.filter((e) => e.type === 'must_find').length,
    got_findings: actualOf(r.actualOutput).kept.length,
    ran_at: r.ranAt.toISOString(),
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
    error: r.error,
  };
}

export function caseToDto(row: EvalCaseRow, last: EvalResultRow | undefined): EvalCaseDetail {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: filesOf(row.inputFiles),
    input_meta: metaOf(row.inputMeta),
    expected_output: expectedOf(row.expectedOutput),
    notes: row.notes,
    source_finding_id: row.sourceFindingId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    last_result: last ? lastResultToDto(last) : null,
  };
}

export function suiteRunToDto(row: EvalSuiteRunRow): EvalSuiteRun {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    host_agent_id: row.hostAgentId,
    scope: row.scope,
    status: row.status,
    agent_version: row.agentVersion,
    config: row.configSnapshot as EvalConfigSnapshot,
    case_ids: row.caseIds,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    vacuous: (row.vacuous as EvalVacuous | null) ?? null,
    traces_passed: row.tracesPassed,
    traces_total: row.tracesTotal,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    error: row.error,
    started_at: row.startedAt.toISOString(),
    finished_at: iso(row.finishedAt),
  };
}

export function resultToDto(r: EvalResultRow): EvalCaseResult {
  const a = actualOf(r.actualOutput);
  return {
    id: r.id,
    case_id: r.caseId,
    case_name: r.caseName ?? '(deleted case)',
    status: (r.status ?? 'fail') as EvalCaseResult['status'],
    expected: expectedOf(r.expectedSnapshot),
    kept: a.kept,
    dropped: a.dropped,
    matched: a.matched,
    unmatched: a.unmatched,
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
    error: r.error,
  };
}

/** A finished run carries metrics (done/partial); running/failed runs are skipped for trend/delta. */
export function hasMetrics(r: EvalSuiteRun): boolean {
  return (r.status === 'done' || r.status === 'partial') && r.recall !== null;
}

export function toPoint(r: EvalSuiteRun): EvalRunPoint {
  return {
    run_id: r.id,
    agent_version: r.agent_version,
    ran_at: r.started_at,
    recall: r.recall ?? 0,
    precision: r.precision ?? 0,
    citation_accuracy: r.citation_accuracy ?? 0,
    traces_passed: r.traces_passed,
    traces_total: r.traces_total,
    cost_usd: r.cost_usd,
  };
}

export function metricDelta(latest: EvalSuiteRun, previous: EvalSuiteRun): EvalMetricDelta {
  return {
    recall: (latest.recall ?? 0) - (previous.recall ?? 0),
    precision: (latest.precision ?? 0) - (previous.precision ?? 0),
    citation_accuracy: (latest.citation_accuracy ?? 0) - (previous.citation_accuracy ?? 0),
  };
}

const METRIC_LABELS: [keyof EvalMetricDelta, string][] = [
  ['recall', 'Recall'],
  ['precision', 'Precision'],
  ['citation_accuracy', 'Citation accuracy'],
];

/**
 * AC-41 banner text: every metric that dropped by ≥ 1 point vs the previous
 * full run, e.g. "Precision dipped 2pts on v7". Null when nothing dropped.
 */
export function regressionAlert(delta: EvalMetricDelta, version: number): string | null {
  const drops = METRIC_LABELS.filter(([k]) => delta[k] <= -ALERT_MIN_DROP + 1e-9).map(
    ([k, label]) => `${label} dipped ${Math.round(-delta[k] * 100)}pts`,
  );
  return drops.length === 0 ? null : `${drops.join(', ')} on v${version}`;
}

/** Days → `since` date; 0 or negative = all time. */
export function sinceDate(days: number, now: Date): Date | undefined {
  return days > 0 ? new Date(now.getTime() - days * 86_400_000) : undefined;
}
