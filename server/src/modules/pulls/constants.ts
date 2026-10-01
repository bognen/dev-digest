/** Worst → best verdict rank, for picking the PR-level "lowest" outcome across runs. */
export const VERDICT_RANK: Record<string, number> = { request_changes: 0, comment: 1, approve: 2 };

/**
 * Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs land
 * with zeroed size/diff. Backfill them once from the detail endpoint so the
 * list shows real S/M/L + ± counts. Capped per request (each backfill is a
 * detail fetch) — the periodic refetch chips away at any remainder.
 */
export const BACKFILL_LIMIT = 10;

/**
 * Smart Diff group order in the response (most review-relevant first). Distinct
 * from the pattern EVALUATION order below.
 */
export const SMART_DIFF_ROLE_ORDER = ['core', 'tests', 'wiring', 'docs', 'boilerplate'] as const;

/**
 * Smart Diff path classification tables, plain data. `classifyPath` walks them
 * in this evaluation order — boilerplate → tests → wiring → docs → core
 * (core = no match) — and the first role that matches wins. Basename patterns
 * are globs on the last path segment (`*` = any run of chars, case-insensitive);
 * directory names match ANY path segment before the basename.
 */
export const SMART_DIFF_BASENAME_PATTERNS = {
  boilerplate: ['*.lock', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', '*.snap', '*.generated.*', '*.min.js'],
  tests: ['*.test.ts', '*.test.tsx', '*.it.test.ts', '*.spec.ts'],
  wiring: ['index.ts', 'index.js', '*.config.*', 'tsconfig*.json', '.eslintrc*', '.env*', 'docker-compose*.yml'],
  docs: ['*.md', 'README*', 'CHANGELOG*', 'LICENSE'],
} as const;

export const SMART_DIFF_DIR_SEGMENTS = {
  boilerplate: ['dist', 'build', '__snapshots__'],
  tests: ['test', 'tests', '__tests__', 'e2e'],
  wiring: ['.github', '.claude'],
  docs: ['docs'],
} as const;

/** Evaluation order for the tables above (first match wins). */
export const SMART_DIFF_EVAL_ORDER = ['boilerplate', 'tests', 'wiring', 'docs'] as const;

/** Above this many changed lines (boilerplate excluded) the PR is flagged `too_big`. */
export const SPLIT_SUGGESTION_MAX_LINES = 400;
