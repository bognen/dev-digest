import type { ApiReview } from "../api-schemas.js";
import {
  countBySeverity,
  minScore,
  sortFindings,
  toConciseFinding,
  toFullFinding,
  worstVerdict,
  type ConciseFinding,
  type FullFinding,
} from "../format.js";

/**
 * Shared shaping of one or more review rows into the concise findings payload
 * used by get_findings and run_agent_on_pr. Pure.
 */

export type Detail = "concise" | "full";

export interface FindingsPayload {
  verdict: string | null;
  score: number | null;
  counts: { critical: number; warning: number; suggestion: number };
  findings: (ConciseFinding | FullFinding)[];
  truncated: number;
  hidden_dismissed: number;
}

export interface ShapeOptions {
  detail: Detail;
  limit: number;
  /** Label each finding with its agent (useful when several reviews are merged). */
  withAgent: boolean;
}

export function shapeReviews(reviews: readonly ApiReview[], opts: ShapeOptions): FindingsPayload {
  const all = reviews.flatMap((r) => r.findings.map((f) => ({ f, agent: r.agent_name ?? null })));
  const active = all.filter((x) => x.f.dismissed_at === null);
  const hidden = all.length - active.length;

  // Count over ALL active findings, not just the page returned.
  const counts = countBySeverity(active.map((x) => x.f));
  const sorted = sortFindings(active.map((x) => ({ ...x.f, __agent: x.agent })));
  const page = sorted.slice(0, opts.limit);

  const findings = page.map(({ __agent, ...f }) => {
    const agent = opts.withAgent ? __agent : null;
    return opts.detail === "full" ? toFullFinding(f, agent) : toConciseFinding(f, agent);
  });

  return {
    verdict: worstVerdict(reviews.map((r) => r.verdict)),
    score: minScore(reviews.map((r) => r.score)),
    counts,
    findings,
    truncated: Math.max(0, sorted.length - page.length),
    hidden_dismissed: hidden,
  };
}
