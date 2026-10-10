import { z } from 'zod';
import { Finding, Verdict } from './findings.js';
import { Intent, IntentConfidence, IntentSource, SmartDiff } from './brief.js';
import { Provider } from './knowledge.js';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/**
 * Intent persisted for a PR: the Intent plus the pr_id it scopes, the
 * code-derived confidence + sources, extracted ticket refs, the linked issue
 * number (if any), the provider/model/head_sha it was generated against, when
 * it was generated, and whether the stored row is stale vs the PR's current
 * title/body/branch/head_sha (computed by the caller, not persisted).
 */
export const PrIntentRecord = Intent.extend({
  pr_id: z.string(),
  confidence: IntentConfidence,
  sources: z.array(IntentSource),
  ticket_refs: z.array(z.string()),
  linked_issue: z.number().int().nullable(),
  provider: Provider.nullable(),
  model: z.string().nullable(),
  head_sha: z.string().nullable(),
  generated_at: z.string(),
  stale: z.boolean(),
});
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Why `GET /pulls/:id/intent` returned no intent. */
export const IntentUnavailableReason = z.enum([
  'not_generated',
  'provider_not_configured',
  'generation_failed',
]);
export type IntentUnavailableReason = z.infer<typeof IntentUnavailableReason>;

/** Response of both `GET` and `POST /pulls/:id/intent`. */
export const PrIntentResponse = z.object({
  intent: PrIntentRecord.nullable(),
  unavailable_reason: IntentUnavailableReason.nullable(),
});
export type PrIntentResponse = z.infer<typeof PrIntentResponse>;

/** Body for `POST /pulls/:id/intent`; `force: true` bypasses the cache. */
export const GenerateIntentRequest = z.object({ force: z.boolean().optional() });
export type GenerateIntentRequest = z.infer<typeof GenerateIntentRequest>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;
