/**
 * Minimum title-token Jaccard similarity for two findings (same file, overlapping
 * lines, different category) to count as the same issue. Single tunable value (AC-69).
 */
export const TITLE_SIMILARITY_THRESHOLD = 0.3;

/**
 * Max line gap at which two NON-overlapping findings in the same file still
 * count as the same issue when their titles are similar. Agents anchor one
 * defect on different lines (e.g. the `try`, the `except`, or the function
 * signature); proximity alone is never enough — the title must match too.
 */
export const NEARBY_LINES = 20;

/** Severity ranking used to pick a group's headline finding and an agent's max severity. */
export const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};
