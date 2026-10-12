import type { ProjectDocRoot } from '@devdigest/shared';
import { isRelativeSafePath } from '../_shared/checkout-paths.js';
import {
  BUDGET_CONTEXT_RATIO,
  BUDGET_FALLBACK_TOKENS,
  BUDGET_MAX_TOKENS,
  BUDGET_MIN_TOKENS,
  IGNORED_DIRS,
  PROJECT_DOC_ROOTS,
} from './constants.js';

/** The project-doc root a path lives under, or null when it is under none. */
export function rootOf(path: string): ProjectDocRoot | null {
  const first = path.split('/')[0];
  return PROJECT_DOC_ROOTS.find((r) => r === first) ?? null;
}

/**
 * True iff `path` is a syntactically valid project-doc path: repo-relative and
 * safe, under a known root (with at least one segment below it), a `.md` file
 * (case-insensitive) and with no ignored directory segment.
 */
export function isProjectDocPath(path: string): boolean {
  if (!isRelativeSafePath(path)) return false;
  const segments = path.split('/');
  if (segments.length < 2 || rootOf(path) === null) return false;
  if (!/\.md$/i.test(path)) return false;
  return !segments.slice(0, -1).some((s) => IGNORED_DIRS.includes(s));
}

/**
 * Merge the agent's own docs with its skills' docs: own first, then skill order,
 * then in-skill order. The first occurrence of a path wins.
 */
export function orderAndDedupe(own: string[], skills: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of [own, ...skills]) {
    for (const p of list) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/**
 * Drop whole documents from the end until the rendered block fits `budget`.
 * `countBlock([])` must be 0 (an empty block renders nothing). When even the
 * first document does not fit, everything is dropped.
 */
export function applyBudget<T>(
  docs: T[],
  countBlock: (docs: T[]) => number,
  budget: number,
): { kept: T[]; dropped: T[] } {
  let end = docs.length;
  while (end > 0 && countBlock(docs.slice(0, end)) > budget) end--;
  return { kept: docs.slice(0, end), dropped: docs.slice(end) };
}

/** Token budget from the model's context window; fallback when unknown (OQ-1). */
export function computeBudget(contextLength: number | null): number {
  if (contextLength === null || !Number.isFinite(contextLength) || contextLength <= 0) {
    return BUDGET_FALLBACK_TOKENS;
  }
  const raw = Math.floor(contextLength * BUDGET_CONTEXT_RATIO);
  return Math.min(BUDGET_MAX_TOKENS, Math.max(BUDGET_MIN_TOKENS, raw));
}

/** Whitespace-only documents carry no information and are skipped (AC-36). */
export function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

/** Client-parity estimate: heading + per-document tokens + separators. */
export function estimateTotal(
  overhead: { heading_tokens: number; separator_tokens: number },
  tokens: number[],
): number {
  if (tokens.length === 0) return 0;
  const sum = tokens.reduce((a, b) => a + b, 0);
  return overhead.heading_tokens + sum + overhead.separator_tokens * (tokens.length - 1);
}
