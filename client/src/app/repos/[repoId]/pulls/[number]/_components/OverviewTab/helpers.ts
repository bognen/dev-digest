import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";

/** Latest agent review: among `kind === "review"` with a verdict, the greatest
 *  `created_at`; ties keep the first in input order. Never mutates the input. */
export function selectLatestReview(reviews: readonly ReviewRecord[]): ReviewRecord | null {
  let best: ReviewRecord | null = null;
  let bestTs = Number.NaN;
  for (const r of reviews) {
    if (r.kind !== "review" || r.verdict == null) continue;
    const ts = Date.parse(r.created_at);
    // Unparseable timestamps (NaN) rank below every valid one.
    if (best === null || (!Number.isNaN(ts) && (Number.isNaN(bestTs) || ts > bestTs))) {
      best = r;
      bestTs = ts;
    }
  }
  return best;
}

/** True when the run with the greatest non-null `ran_at` failed. */
export function isNewestRunFailed(runs: readonly RunSummary[] | undefined): boolean {
  if (!runs) return false;
  let newest: RunSummary | null = null;
  let newestTs = -Infinity;
  for (const r of runs) {
    if (r.ran_at == null) continue;
    const ts = Date.parse(r.ran_at);
    if (Number.isNaN(ts)) continue;
    if (newest === null || ts > newestTs) {
      newest = r;
      newestTs = ts;
    }
  }
  return newest !== null && newest.status === "failed";
}

/** Blockers: CRITICAL and not dismissed (same rule as ReviewRunAccordion). */
export function countBlockers(findings: readonly FindingRecord[]): number {
  return findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}
