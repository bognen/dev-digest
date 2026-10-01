import type { PrMeta, PrFindingsSummary, SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { rollupSeverities, type SeverityCounts } from './status.js';
import {
  VERDICT_RANK,
  SMART_DIFF_ROLE_ORDER,
  SMART_DIFF_BASENAME_PATTERNS,
  SMART_DIFF_DIR_SEGMENTS,
  SMART_DIFF_EVAL_ORDER,
  SPLIT_SUGGESTION_MAX_LINES,
} from './constants.js';
import type {
  PullRecord,
  ReviewRollupRow,
  FindingSeverityRow,
  RunCostRow,
  PrFileStat,
  FindingAnchorRow,
} from './types.js';

/**
 * Pure aggregation/mapping for the pulls-list rollup (ring 1 — no I/O, no
 * `this`). Extracted from the SCORE + STATUS + FINDINGS block that used to
 * live inline in `pulls/routes.ts`'s `GET /repos/:id/pulls` handler.
 */

export interface ScoreVerdictAgg {
  scoreByPr: Map<string, number | null>;
  worstVerdictByPr: Map<string, string | null>;
  /** Ids of each PR's latest-per-agent review (feeds the findings query). */
  latestReviewIds: string[];
  /** PRs that have at least one qualifying (latest-per-agent) review. */
  prIdsWithLatestReview: Set<string>;
}

/**
 * SCORE + STATUS aggregated across each AGENT'S LATEST completed review only
 * — re-running the same agent supersedes its prior pass rather than stacking
 * a stale run's score/findings on top of the fresh one. Re-running a
 * DIFFERENT agent still contributes its own latest review — this scopes
 * "latest" to "latest PER AGENT", not "only the single latest review on the
 * PR". `rows` must be ordered newest-first. A null agentId can't be deduped
 * against other runs, so each such review counts as its own group (falls
 * back to its own row id as the grouping key).
 */
export function computeScoreAndVerdictByPr(rows: ReviewRollupRow[]): ScoreVerdictAgg {
  const scoreByPr = new Map<string, number | null>();
  const worstVerdictByPr = new Map<string, string | null>();
  const latestReviewIds: string[] = [];
  const prIdsWithLatestReview = new Set<string>();
  const seenPrAgent = new Set<string>();

  for (const rv of rows) {
    const key = `${rv.prId}:${rv.agentId ?? rv.id}`;
    if (seenPrAgent.has(key)) continue;
    seenPrAgent.add(key);
    latestReviewIds.push(rv.id);
    prIdsWithLatestReview.add(rv.prId);

    if (rv.score != null) {
      const prior = scoreByPr.get(rv.prId);
      if (prior == null || rv.score < prior) scoreByPr.set(rv.prId, rv.score);
    }
    if (rv.verdict && VERDICT_RANK[rv.verdict] != null) {
      const prior = worstVerdictByPr.get(rv.prId);
      if (!prior || VERDICT_RANK[rv.verdict]! < VERDICT_RANK[prior]!) {
        worstVerdictByPr.set(rv.prId, rv.verdict);
      }
    }
  }

  return { scoreByPr, worstVerdictByPr, latestReviewIds, prIdsWithLatestReview };
}

/**
 * Every PR with at least one qualifying (latest-per-agent) review gets a real
 * zero-filled findings object, not `null` — `null` is reserved for "no
 * completed review at all yet".
 */
export function computeFindingsByPr(
  findingRows: FindingSeverityRow[],
  prIdsWithLatestReview: Set<string>,
): Map<string, SeverityCounts> {
  const bySeverityRowsByPr = new Map<string, { severity: string }[]>();
  for (const fr of findingRows) {
    const list = bySeverityRowsByPr.get(fr.prId) ?? [];
    list.push({ severity: fr.severity });
    bySeverityRowsByPr.set(fr.prId, list);
  }
  const findingsByPr = new Map<string, SeverityCounts>();
  for (const prId of prIdsWithLatestReview) {
    findingsByPr.set(prId, rollupSeverities(bySeverityRowsByPr.get(prId) ?? []));
  }
  return findingsByPr;
}

/**
 * Total cost across every COMPLETED run for the PR (e.g. running 3 agents on
 * one PR shows their combined cost, not just the newest one's). Null-
 * propagates: if ANY completed run's cost is unknown (unpriced model), the
 * PR's total is unknown too, rather than silently undercounting — same rule
 * as reviewer-core's per-run cost summation.
 */
export function computeCostByPr(runRows: RunCostRow[]): Map<string, number | null> {
  const costByPr = new Map<string, number | null>();
  for (const run of runRows) {
    const prior = costByPr.has(run.prId) ? costByPr.get(run.prId)! : 0;
    costByPr.set(run.prId, prior == null || run.costUsd == null ? null : prior + run.costUsd);
  }
  return costByPr;
}

export function toPrMetaDto(
  pull: PullRecord,
  extra: {
    status: PrMeta['status'];
    score: number | null;
    cost: number | null;
    findings: SeverityCounts | null;
  },
): PrMeta {
  const findings: PrFindingsSummary | null = extra.findings
    ? {
        critical: extra.findings.critical,
        warning: extra.findings.warning,
        suggestion: extra.findings.suggestion,
      }
    : null;
  return {
    id: pull.id,
    number: pull.number,
    title: pull.title,
    author: pull.author,
    branch: pull.branch,
    base: pull.base,
    head_sha: pull.headSha,
    additions: pull.additions,
    deletions: pull.deletions,
    files_count: pull.filesCount,
    status: extra.status,
    opened_at: pull.openedAt?.toISOString() ?? null,
    updated_at: pull.updatedAt?.toISOString() ?? null,
    score: extra.score,
    cost_usd: extra.cost,
    findings,
  };
}

// ---- Smart Diff ----------------------------------------------------------

/** Compile a basename glob (`*` only) to an anchored, case-insensitive regex. */
function globToRegExp(glob: string): RegExp {
  const body = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}$`, 'i');
}

type ClassifiedRole = (typeof SMART_DIFF_EVAL_ORDER)[number];

const BASENAME_REGEXPS: Record<ClassifiedRole, RegExp[]> = {
  boilerplate: SMART_DIFF_BASENAME_PATTERNS.boilerplate.map(globToRegExp),
  tests: SMART_DIFF_BASENAME_PATTERNS.tests.map(globToRegExp),
  wiring: SMART_DIFF_BASENAME_PATTERNS.wiring.map(globToRegExp),
  docs: SMART_DIFF_BASENAME_PATTERNS.docs.map(globToRegExp),
};

/**
 * Classify a repo-relative path into a Smart Diff role. Pure; splits on '/'
 * only (GitHub paths always use it — never node:path). Roles are tried in
 * SMART_DIFF_EVAL_ORDER (boilerplate -> tests -> wiring -> docs) and the FIRST
 * match wins; no match = `core`. The precedence is deliberate, e.g.:
 *   src/__tests__/__snapshots__/x.snap  -> boilerplate (not tests)
 *   .claude/skills/security/SKILL.md    -> wiring      (not docs)
 *   e2e/README.md                       -> tests       (not docs)
 *   src/index.test.ts                   -> tests       (not wiring)
 *   docs/index.ts                       -> wiring      (not docs)
 * Directory rules match ANY segment before the basename.
 */
export function classifyPath(path: string): SmartDiffRole {
  const segments = path.split('/');
  const basename = segments[segments.length - 1] ?? '';
  const dirs = new Set(segments.slice(0, -1).map((d) => d.toLowerCase()));
  for (const role of SMART_DIFF_EVAL_ORDER) {
    if (BASENAME_REGEXPS[role].some((re) => re.test(basename))) return role;
    if (SMART_DIFF_DIR_SEGMENTS[role].some((d) => dirs.has(d.toLowerCase()))) return role;
  }
  return 'core';
}

/**
 * Sorted, de-duplicated start lines of OPEN (not dismissed) findings, keyed by
 * file path.
 */
export function openFindingLinesByPath(rows: FindingAnchorRow[]): Map<string, number[]> {
  const byPath = new Map<string, Set<number>>();
  for (const row of rows) {
    if (row.dismissedAt != null) continue;
    const set = byPath.get(row.file) ?? new Set<number>();
    set.add(row.startLine);
    byPath.set(row.file, set);
  }
  const result = new Map<string, number[]>();
  for (const [file, lines] of byPath) result.set(file, [...lines].sort((a, b) => a - b));
  return result;
}

/** Groups in SMART_DIFF_ROLE_ORDER (empty omitted), files sorted by path. Findings for files not in the PR are dropped. */
export function buildSmartDiff(files: PrFileStat[], findingLines: Map<string, number[]>): SmartDiff {
  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  for (const f of files) {
    const role = classifyPath(f.path);
    const list = byRole.get(role) ?? [];
    list.push({
      path: f.path,
      pseudocode_summary: null,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: findingLines.get(f.path) ?? [],
    });
    byRole.set(role, list);
  }
  const groups: SmartDiffGroup[] = [];
  for (const role of SMART_DIFF_ROLE_ORDER) {
    const list = byRole.get(role);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    groups.push({ role, files: list });
  }
  return { groups, split_suggestion: buildSplitSuggestion(groups) };
}

/** Boilerplate is excluded from the size total; splits are proposed only when too big. */
export function buildSplitSuggestion(groups: SmartDiffGroup[]): SmartDiff['split_suggestion'] {
  const reviewable = groups.filter((g) => g.role !== 'boilerplate' && g.files.length > 0);
  const totalLines = reviewable.reduce(
    (sum, g) => sum + g.files.reduce((s, f) => s + f.additions + f.deletions, 0),
    0,
  );
  const tooBig = totalLines > SPLIT_SUGGESTION_MAX_LINES;
  return {
    too_big: tooBig,
    total_lines: totalLines,
    proposed_splits: tooBig ? reviewable.map((g) => ({ name: g.role, files: g.files.map((f) => f.path) })) : [],
  };
}
