import { z } from 'zod';
import { FindingRecord } from './review-api.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiRunDetail / MultiRunChild  the multi-agent run read model (SPEC-07)
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review (SPEC-07)
// ---------------------------------------------------------------------------

/** Aggregate status of a multi-run; derived from the children when read, never stored. */
export const MultiRunStatus = z.enum(['running', 'done', 'partial', 'failed', 'cancelled']);
export type MultiRunStatus = z.infer<typeof MultiRunStatus>;

/** Status of one child run inside a multi-run. */
export const ChildRunStatus = z.enum(['queued', 'running', 'done', 'failed', 'cancelled']);
export type ChildRunStatus = z.infer<typeof ChildRunStatus>;

/** Body of POST /pulls/:id/multi-agent-runs. */
export const CreateMultiRunRequest = z.object({
  agent_ids: z.array(z.string().uuid()).min(1),
});
export type CreateMultiRunRequest = z.infer<typeof CreateMultiRunRequest>;

export const CreateMultiRunResponse = z.object({
  multi_run_id: z.string(),
  runs: z.array(
    z.object({
      run_id: z.string(),
      agent_id: z.string(),
      agent_name: z.string(),
      position: z.number().int(),
    }),
  ),
});
export type CreateMultiRunResponse = z.infer<typeof CreateMultiRunResponse>;

/** One child run (= one agent's column) of a multi-run. */
export const MultiRunChild = z.object({
  run_id: z.string(),
  position: z.number().int(),
  /** Null when the agent was deleted after the run. */
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: ChildRunStatus,
  error: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(FindingRecord),
});
export type MultiRunChild = z.infer<typeof MultiRunChild>;

/** Response of GET /multi-agent-runs/:id. */
export const MultiRunDetail = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string(),
  ran_at: z.string(),
  status: MultiRunStatus,
  total_duration_ms: z.number().int().nullable(),
  total_cost_usd: z.number().nullable(),
  children: z.array(MultiRunChild),
});
export type MultiRunDetail = z.infer<typeof MultiRunDetail>;

/** Response of GET /pulls/:id/multi-agent-runs/latest. */
export const LatestMultiRunResponse = z.object({
  multi_run: z
    .object({ id: z.string(), status: MultiRunStatus, ran_at: z.string() })
    .nullable(),
});
export type LatestMultiRunResponse = z.infer<typeof LatestMultiRunResponse>;

/** Per-agent median duration / cost over recent done runs; absent agent = no estimate. */
export const AgentEstimate = z.object({
  agent_id: z.string(),
  duration_ms: z.number().nullable(),
  cost_usd: z.number().nullable(),
});
export type AgentEstimate = z.infer<typeof AgentEstimate>;

export const AgentEstimatesResponse = z.object({
  estimates: z.array(AgentEstimate),
});
export type AgentEstimatesResponse = z.infer<typeof AgentEstimatesResponse>;

export const CancelMultiRunResponse = z.object({
  cancelled: z.number().int(),
});
export type CancelMultiRunResponse = z.infer<typeof CancelMultiRunResponse>;

/** Query of GET /multi-agent-runs: one repo's runs, newest first. */
export const MultiRunListQuery = z.object({
  repo_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type MultiRunListQuery = z.infer<typeof MultiRunListQuery>;

/** One row of the previous-runs list (no findings, just counts + totals). */
export const MultiRunSummary = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string(),
  ran_at: z.string(),
  status: MultiRunStatus,
  /** Agent names in selection order; null for a deleted agent. */
  agent_names: z.array(z.string().nullable()),
  finding_count: z.number().int(),
  total_duration_ms: z.number().int().nullable(),
  total_cost_usd: z.number().nullable(),
});
export type MultiRunSummary = z.infer<typeof MultiRunSummary>;

export const MultiRunListResponse = z.object({
  multi_runs: z.array(MultiRunSummary),
});
export type MultiRunListResponse = z.infer<typeof MultiRunListResponse>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
