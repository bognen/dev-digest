import { z } from 'zod';
import { FindingRecord } from './review-api.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiRunDetail / MultiRunChild  the multi-agent run read model (SPEC-07)
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - AgentPerformance     all-agent aggregates (GET /agent-performance)
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
// Per-agent Stats (GET /agents/:id/stats) + Agent Performance (GET /agent-performance)
// ---------------------------------------------------------------------------
//
// Both endpoints are computed by ONE server aggregation over stored rows only
// (agent_runs + reviews + findings) — never a model call — so an agent's row on
// the dashboard and its Stats tab agree for the same range. Rules:
//   - an included run is a `done`, `local` agent_run of a live agent with
//     `from <= ran_at < to` (failed/cancelled/CI runs and deleted agents are out);
//   - cost = sum of the included runs' stored `cost_usd` (unpriced runs add 0
//     and are counted in `unpriced_runs`); avg cost = cost / priced runs;
//   - accept-rate = accepted / (accepted + dismissed) over findings of the
//     included runs; pending findings are not in the denominator.

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

/** Longest range either stats endpoint accepts (bounds the per-day series). */
export const MAX_STATS_RANGE_DAYS = 366;

/** Query of both stats endpoints: half-open ISO range `[from, to)`. */
export const StatsRangeQuery = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .refine((q) => Date.parse(q.from) < Date.parse(q.to), {
    message: '`from` must be before `to`',
  })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= MAX_STATS_RANGE_DAYS * 86_400_000, {
    message: `range must not exceed ${MAX_STATS_RANGE_DAYS} days`,
  });
export type StatsRangeQuery = z.infer<typeof StatsRangeQuery>;

export const StatsRange = z.object({ from: z.string(), to: z.string() });
export type StatsRange = z.infer<typeof StatsRange>;

/**
 * Where cost numbers come from. Every stored run cost today is a DevDigest
 * estimate (tokens x price table / OpenRouter list price); `reconciled` is
 * reserved for provider billing data, which DevDigest does not ingest yet.
 */
export const CostBasis = z.enum(['estimate', 'reconciled']);
export type CostBasis = z.infer<typeof CostBasis>;

/** Cost attributed to one model (`agent_runs.model`; null when not recorded). */
export const ModelCost = z.object({
  model: z.string().nullable(),
  runs: z.number().int(),
  cost_usd: z.number(),
});
export type ModelCost = z.infer<typeof ModelCost>;

/** One agent's aggregates for a range — a dashboard row AND the Stats tab headline. */
export const AgentPerfRow = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  /** Included runs in range. */
  runs: z.number().int(),
  priced_runs: z.number().int(),
  unpriced_runs: z.number().int(),
  total_cost_usd: z.number(),
  /** total_cost_usd / priced_runs; null when no included run has a price. */
  avg_cost_usd: z.number().nullable(),
  avg_duration_ms: z.number().nullable(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  /** accepted + dismissed — the accept-rate denominator. */
  decided: z.number().int(),
  /** 0..1; null when nothing was decided. */
  accept_rate: z.number().nullable(),
  /** decided < min_decisions: the rate is shown but not ranked. */
  low_sample: z.boolean(),
  last_run_at: z.string().nullable(),
  cost_by_model: z.array(ModelCost),
});
export type AgentPerfRow = z.infer<typeof AgentPerfRow>;

/** Response of GET /agents/:id/stats. */
export const AgentStats = AgentPerfRow.extend({
  range: StatsRange,
  min_decisions: z.number().int(),
  cost_basis: CostBasis,
  findings_total: z.number().int(),
  pending: z.number().int(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** Included runs per UTC day (oldest→newest, gap days = 0). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

/** Response of GET /agent-performance. */
export const AgentPerformance = z.object({
  range: StatsRange,
  min_decisions: z.number().int(),
  cost_basis: CostBasis,
  /** Number of agents in the workspace (0 → "no agents" empty state). */
  agent_count: z.number().int(),
  totals: z.object({
    runs: z.number().int(),
    priced_runs: z.number().int(),
    unpriced_runs: z.number().int(),
    /** Sum of included runs' costs == sum(cost_by_agent) == sum(cost_by_model). */
    total_cost_usd: z.number(),
    accepted: z.number().int(),
    decided: z.number().int(),
    /** Pooled: sum(accepted) / sum(decided) across agents; null when 0 decided. */
    accept_rate: z.number().nullable(),
  }),
  /** Agent with the most included runs (ties → name); null when no runs. */
  most_active: z
    .object({
      agent_id: z.string(),
      agent_name: z.string(),
      runs: z.number().int(),
      accept_rate: z.number().nullable(),
      decided: z.number().int(),
    })
    .nullable(),
  /** Every agent in the workspace, including ones with no runs in range. */
  agents: z.array(AgentPerfRow),
  cost_by_agent: z.array(
    z.object({ agent_id: z.string(), agent_name: z.string(), cost_usd: z.number() }),
  ),
  cost_by_model: z.array(ModelCost),
  /** Included runs per UTC day across all agents (oldest→newest). */
  runs_by_day: z.array(StatPoint),
});
export type AgentPerformance = z.infer<typeof AgentPerformance>;

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
