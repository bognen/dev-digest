import { z } from "zod";
import { ApiSchemaError } from "./errors.js";

/**
 * Local Zod schemas for ONLY the response fields this server consumes
 * (no @devdigest/shared alias, no imports from server/ or client/). Unknown
 * keys are stripped. Field names mirror the API's snake_case contract.
 */

export const SeveritySchema = z.enum(["CRITICAL", "WARNING", "SUGGESTION"]);
export type ApiSeverity = z.infer<typeof SeveritySchema>;

export const VerdictSchema = z.enum(["request_changes", "approve", "comment"]);
export type ApiVerdict = z.infer<typeof VerdictSchema>;

export const RepoSchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
});
export type ApiRepo = z.infer<typeof RepoSchema>;

export const PullSchema = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
});
export type ApiPull = z.infer<typeof PullSchema>;

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  provider: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type ApiAgent = z.infer<typeof AgentSchema>;

/** Row of GET /pulls/:id/runs/active. */
export const ActiveRunSchema = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  ran_at: z.string().nullable(),
});
export type ApiActiveRun = z.infer<typeof ActiveRunSchema>;

/** Row of GET /pulls/:id/runs. status: running | done | failed | cancelled. */
export const RunSummarySchema = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  status: z.string().nullable(),
  error: z.string().nullable(),
  score: z.number().int().nullable(),
  findings_count: z.number().int().nullable(),
  ran_at: z.string().nullable(),
});
export type ApiRunSummary = z.infer<typeof RunSummarySchema>;

/** POST /pulls/:id/review response (only the run targets are consumed). */
export const ReviewRunResponseSchema = z.object({
  runs: z.array(
    z.object({
      run_id: z.string(),
      agent_id: z.string(),
      agent_name: z.string(),
    }),
  ),
});
export type ApiReviewRunResponse = z.infer<typeof ReviewRunResponseSchema>;

export const FindingRecordSchema = z.object({
  id: z.string(),
  severity: SeveritySchema,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
  dismissed_at: z.string().nullable(),
});
export type ApiFinding = z.infer<typeof FindingRecordSchema>;

/** Row of GET /pulls/:id/reviews. */
export const ReviewRecordSchema = z.object({
  id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(["summary", "review"]),
  verdict: VerdictSchema.nullable(),
  score: z.number().int().nullable(),
  created_at: z.string(),
  findings: z.array(FindingRecordSchema),
});
export type ApiReview = z.infer<typeof ReviewRecordSchema>;

/** Row of GET /repos/:id/conventions. */
export const ConventionSchema = z.object({
  id: z.string(),
  category: z.string(),
  rule: z.string(),
  rationale: z.string().nullish(),
  evidence_path: z.string(),
  evidence_line: z.number().int().nullish(),
  occurrences: z.number().int(),
  confidence: z.number(),
  status: z.string(),
});
export type ApiConvention = z.infer<typeof ConventionSchema>;

export const ReposSchema = z.array(RepoSchema);
export const PullsSchema = z.array(PullSchema);
export const AgentsSchema = z.array(AgentSchema);
export const ActiveRunsSchema = z.array(ActiveRunSchema);
export const RunSummariesSchema = z.array(RunSummarySchema);
export const ReviewsSchema = z.array(ReviewRecordSchema);
export const ConventionsSchema = z.array(ConventionSchema);

/**
 * Validate an API response. On mismatch throws ApiSchemaError(endpoint) so the
 * user gets "Unexpected API response shape for <endpoint> (API/MCP version
 * mismatch?)". The endpoint label must be a path template without secrets/ids.
 */
export function parseResponse<S extends z.ZodType>(
  endpoint: string,
  schema: S,
  data: unknown,
): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new ApiSchemaError(endpoint);
  return result.data;
}

/**
 * GET /pulls/:id/blast — consumed fields only. status/degradedReason stay
 * plain strings (not enums) so a new server-side value never breaks parsing.
 * Wire key `degradedReason` is camelCase; everything inside `data` is snake_case.
 */
export const BlastResponseSchema = z.object({
  status: z.string(),
  degradedReason: z.string().nullish(),
  data: z.object({
    changed_symbols: z.array(z.object({ name: z.string(), file: z.string(), kind: z.string() })),
    downstream: z.array(
      z.object({
        symbol: z.string(),
        callers: z.array(
          z.object({ name: z.string(), file: z.string(), line: z.number().int(), rank: z.number() }),
        ),
        endpoints_affected: z.array(z.string()),
        crons_affected: z.array(z.string()),
      }),
    ),
    summary: z.string().nullish(),
  }),
});
export type ApiBlast = z.infer<typeof BlastResponseSchema>;
