import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Eval pipeline (SPEC-06) — typed cases, suite runs, dashboards, compare
// ===========================================================================

/** Hard limits shared by the case editor (client) and validation (server). */
export const EVAL_LIMITS = {
  maxDiffBytes: 200_000,
  maxFileBytes: 100_000,
  maxFiles: 10,
  maxExpectations: 10,
  snippetMaxDiffLines: 400,
} as const;

/** accepted finding → must_find; dismissed finding → must_not_flag. */
export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;

/** One `file:line-range` assertion. Labels are display-only, never scored. */
export const EvalExpectation = z.object({
  id: z.string().min(1),
  type: EvalExpectationType,
  file: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  severity: z.string().nullish(),
  category: z.string().nullish(),
  title: z.string().nullish(),
});
export type EvalExpectation = z.infer<typeof EvalExpectation>;

/** `eval_cases.expected_output`. Zero expectations = a "clean" case (expect 0 findings). */
export const EvalExpectedOutput = z.object({
  expectations: z.array(EvalExpectation).max(EVAL_LIMITS.maxExpectations),
});
export type EvalExpectedOutput = z.infer<typeof EvalExpectedOutput>;

/** A full file attached to a case — read-only model context, never grounded. */
export const EvalCaseFile = z.object({
  path: z.string().min(1),
  content: z.string(),
});
export type EvalCaseFile = z.infer<typeof EvalCaseFile>;

/** `eval_cases.input_meta`: PR text + provenance of a finding-derived case. */
export const EvalCaseMeta = z.object({
  pr_title: z.string().default(''),
  pr_body: z.string().default(''),
  source: z
    .object({
      finding_id: z.string(),
      review_id: z.string(),
      pr_id: z.string(),
      repo: z.string(),
      pr_number: z.number().int(),
    })
    .nullish(),
});
export type EvalCaseMeta = z.infer<typeof EvalCaseMeta>;

export const EvalCaseResultStatus = z.enum(['pass', 'fail', 'error']);
export type EvalCaseResultStatus = z.infer<typeof EvalCaseResultStatus>;

/** Compact last-run outcome shown on a case row. */
export const EvalCaseLastResult = z.object({
  status: EvalCaseResultStatus,
  expected_findings: z.number().int(),
  got_findings: z.number().int(),
  ran_at: z.string(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  error: z.string().nullable(),
});
export type EvalCaseLastResult = z.infer<typeof EvalCaseLastResult>;

/** A case as the API returns it (typed JSON fields + last result). */
export const EvalCaseDetail = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.array(EvalCaseFile),
  input_meta: EvalCaseMeta,
  expected_output: EvalExpectedOutput,
  notes: z.string().nullable(),
  source_finding_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  last_result: EvalCaseLastResult.nullable(),
});
export type EvalCaseDetail = z.infer<typeof EvalCaseDetail>;

/** Manual create / update body (owner comes from the body on create). */
export const EvalCaseUpsert = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  input_diff: z.string().min(1),
  input_files: z.array(EvalCaseFile).max(EVAL_LIMITS.maxFiles).default([]),
  pr_title: z.string().max(500).default(''),
  pr_body: z.string().max(20_000).default(''),
  expectations: z.array(EvalExpectation.omit({ id: true }).extend({ id: z.string().optional() })),
  notes: z.string().max(2000).nullish(),
});
export type EvalCaseUpsert = z.infer<typeof EvalCaseUpsert>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type EvalCaseUpsertBody = z.input<typeof EvalCaseUpsert>;

/** `POST /findings/:id/eval-case` response. */
export const CreateCaseFromFindingResult = z.object({
  case: EvalCaseDetail,
  created: z.boolean(),
  note: z.string().nullable(),
});
export type CreateCaseFromFindingResult = z.infer<typeof CreateCaseFromFindingResult>;

export const EvalSuiteRunStatus = z.enum(['running', 'done', 'partial', 'failed']);
export type EvalSuiteRunStatus = z.infer<typeof EvalSuiteRunStatus>;

export const EvalRunScope = z.enum(['full', 'case']);
export type EvalRunScope = z.infer<typeof EvalRunScope>;

/** Which metrics had a zero denominator (stored as 1.0, shown "n/a"). */
export const EvalVacuous = z.object({
  recall: z.boolean(),
  precision: z.boolean(),
  citation_accuracy: z.boolean(),
});
export type EvalVacuous = z.infer<typeof EvalVacuous>;

/** The agent config a suite run executed with (version snapshot + skill versions). */
export const EvalConfigSnapshot = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  agent_version: z.number().int(),
  provider: z.string(),
  model: z.string(),
  system_prompt: z.string(),
  strategy: z.string(),
  skills: z.array(z.object({ id: z.string(), name: z.string(), version: z.number().int() })),
});
export type EvalConfigSnapshot = z.infer<typeof EvalConfigSnapshot>;

/** One execution of an owner's case set (or of a single case, scope='case'). */
export const EvalSuiteRun = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  host_agent_id: z.string(),
  scope: EvalRunScope,
  status: EvalSuiteRunStatus,
  agent_version: z.number().int(),
  config: EvalConfigSnapshot,
  case_ids: z.array(z.string()),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  vacuous: EvalVacuous.nullable(),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  error: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

/** A finding the grounding gate dropped, with why. */
export const EvalDroppedFinding = z.object({ finding: Finding, reason: z.string() });
export type EvalDroppedFinding = z.infer<typeof EvalDroppedFinding>;

/** Per-case result inside a suite run (survives case deletion via snapshots). */
export const EvalCaseResult = z.object({
  id: z.string(),
  case_id: z.string().nullable(),
  case_name: z.string(),
  status: EvalCaseResultStatus,
  expected: EvalExpectedOutput,
  kept: z.array(Finding),
  dropped: z.array(EvalDroppedFinding),
  matched: z.array(z.string()),
  unmatched: z.array(z.string()),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  error: z.string().nullable(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

export const EvalSuiteRunDetail = EvalSuiteRun.extend({ results: z.array(EvalCaseResult) });
export type EvalSuiteRunDetail = z.infer<typeof EvalSuiteRunDetail>;

/** `POST /skills/:id/eval-runs` body — the host agent that runs the skill. */
export const StartEvalRunBody = z.object({ host_agent_id: z.string().uuid().optional() });
export type StartEvalRunBody = z.infer<typeof StartEvalRunBody>;

/** One point of the trend chart (a full suite run). */
export const EvalRunPoint = z.object({
  run_id: z.string(),
  agent_version: z.number().int(),
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  cost_usd: z.number().nullable(),
});
export type EvalRunPoint = z.infer<typeof EvalRunPoint>;

/** Metric deltas (latest − previous full run), in fractions (0.04 = 4 pts). */
export const EvalMetricDelta = z.object({
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
});
export type EvalMetricDelta = z.infer<typeof EvalMetricDelta>;

/** `GET /eval/dashboard/:ownerKind/:ownerId` — one owner's eval view. */
export const EvalOwnerDashboard = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  owner_name: z.string(),
  model: z.string().nullable(),
  cases_total: z.number().int(),
  latest: EvalSuiteRun.nullable(),
  delta: EvalMetricDelta.nullable(),
  alert: z.string().nullable(),
  running: EvalSuiteRun.nullable(),
  trend: z.array(EvalRunPoint),
  history: z.array(EvalSuiteRun),
});
export type EvalOwnerDashboard = z.infer<typeof EvalOwnerDashboard>;

/** One agent row on the Eval Dashboard overview. */
export const EvalAgentSummary = z.object({
  agent_id: z.string(),
  name: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  cases_total: z.number().int(),
  latest: EvalSuiteRun.nullable(),
  spark: z.array(z.number()),
  running: z.boolean(),
});
export type EvalAgentSummary = z.infer<typeof EvalAgentSummary>;

/** A recent run across all owners, with the owner's display name. */
export const EvalRecentRun = EvalSuiteRun.extend({ owner_name: z.string() });
export type EvalRecentRun = z.infer<typeof EvalRecentRun>;

/** `GET /eval/overview`. */
export const EvalOverview = z.object({
  agents: z.array(EvalAgentSummary),
  recent_runs: z.array(EvalRecentRun),
});
export type EvalOverview = z.infer<typeof EvalOverview>;

/** `POST /eval/runs/:id/promote`. */
export const PromoteResult = z.object({
  agent_id: z.string(),
  agent_version: z.number().int(),
  skipped_skills: z.array(z.string()),
});
export type PromoteResult = z.infer<typeof PromoteResult>;

/** `POST /eval/run-all`. */
export const RunAllResult = z.object({
  started: z.array(z.object({ agent_id: z.string(), run_id: z.string() })),
  skipped: z.array(z.object({ agent_id: z.string(), reason: z.string() })),
});
export type RunAllResult = z.infer<typeof RunAllResult>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
