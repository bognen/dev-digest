import type { EvalExpectation, EvalVacuous, Finding } from '@devdigest/shared';

/**
 * SPEC-06 scoring — pure code, zero LLM calls (AC-26, NFR-1, NFR-2).
 *
 * A kept finding MATCHES an expectation when the file paths are equal after
 * prefix normalisation and the line ranges overlap (inclusive) — AC-20.
 * Per run (micro-averaged over every case):
 *   recall            = matched must_find / all must_find            (AC-21)
 *   precision         = kept findings matching a must_find of their own case
 *                       / all kept findings — everything else is noise (AC-22)
 *   citation_accuracy = kept / (kept + dropped)                       (AC-23)
 * A zero denominator yields 1.0 and a `vacuous` flag (AC-24).
 */

/** Strip a leading `./`, `a/` or `b/` (git diff prefixes) — AC-20 / EC-11. */
export function normalizePath(p: string): string {
  let s = p.trim().replace(/\\/g, '/');
  if (s.startsWith('./')) s = s.slice(2);
  else if (s.startsWith('a/') || s.startsWith('b/')) s = s.slice(2);
  return s;
}

/** Inclusive overlap of [aStart, aEnd] and [bStart, bEnd]; reversed ranges are normalised. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const aLo = Math.min(aStart, aEnd);
  const aHi = Math.max(aStart, aEnd);
  const bLo = Math.min(bStart, bEnd);
  const bHi = Math.max(bStart, bEnd);
  return aLo <= bHi && bLo <= aHi;
}

type Located = Pick<Finding, 'file' | 'start_line' | 'end_line'>;

/** Does finding `f` hit expectation `e`? (file equal + lines overlap) */
export function findingMatches(f: Located, e: Pick<EvalExpectation, 'file' | 'start_line' | 'end_line'>): boolean {
  return (
    normalizePath(f.file) === normalizePath(e.file) &&
    rangesOverlap(f.start_line, f.end_line, e.start_line, e.end_line)
  );
}

/** What one case produced: grounded (kept) + dropped findings, or an error. */
export interface CaseOutcomeInput {
  expectations: EvalExpectation[];
  /** Findings that passed the grounding gate. */
  kept: Finding[];
  /** How many findings the grounding gate dropped. */
  droppedCount: number;
  /** Set when reviewing the case failed — the case then produced no findings. */
  error?: string | null;
}

export interface CaseScore {
  status: 'pass' | 'fail' | 'error';
  /** Expectation ids satisfied (must_find hit, or must_not_flag left clean). */
  matched: string[];
  /** Expectation ids violated (must_find missed, or must_not_flag hit). */
  unmatched: string[];
  /** Kept findings that hit one of this case's must_find expectations. */
  truePositives: number;
  mustFindTotal: number;
  mustFindMatched: number;
}

/**
 * Score one case. Pass rule (AC-25): every must_find matched, no kept finding on
 * a must_not_flag range, and — for a case with zero expectations ("clean") — no
 * kept finding at all. An errored case fails every must_find (AC-16, AC-21).
 */
export function scoreCase(input: CaseOutcomeInput): CaseScore {
  const mustFind = input.expectations.filter((e) => e.type === 'must_find');
  const mustNot = input.expectations.filter((e) => e.type === 'must_not_flag');

  if (input.error) {
    return {
      status: 'error',
      matched: [],
      unmatched: input.expectations.map((e) => e.id),
      truePositives: 0,
      mustFindTotal: mustFind.length,
      mustFindMatched: 0,
    };
  }

  const matched: string[] = [];
  const unmatched: string[] = [];
  let mustFindMatched = 0;
  for (const e of mustFind) {
    if (input.kept.some((f) => findingMatches(f, e))) {
      matched.push(e.id);
      mustFindMatched++;
    } else {
      unmatched.push(e.id);
    }
  }
  for (const e of mustNot) {
    if (input.kept.some((f) => findingMatches(f, e))) unmatched.push(e.id);
    else matched.push(e.id);
  }

  const truePositives = input.kept.filter((f) => mustFind.some((e) => findingMatches(f, e))).length;
  const clean = input.expectations.length === 0;
  const pass = unmatched.length === 0 && (!clean || input.kept.length === 0);

  return {
    status: pass ? 'pass' : 'fail',
    matched,
    unmatched,
    truePositives,
    mustFindTotal: mustFind.length,
    mustFindMatched,
  };
}

export interface RunScore {
  recall: number;
  precision: number;
  citation_accuracy: number;
  vacuous: EvalVacuous;
  traces_passed: number;
  traces_total: number;
  cases: CaseScore[];
}

/** Ratio with the AC-24 convention: 0/0 → 1.0 and flagged vacuous. */
function ratio(num: number, den: number): { value: number; vacuous: boolean } {
  return den === 0 ? { value: 1, vacuous: true } : { value: num / den, vacuous: false };
}

/** Aggregate every case of a run into the three metrics + pass count. */
export function scoreRun(outcomes: CaseOutcomeInput[]): RunScore {
  const cases = outcomes.map(scoreCase);
  let mustFindTotal = 0;
  let mustFindMatched = 0;
  let truePositives = 0;
  let keptTotal = 0;
  let droppedTotal = 0;

  outcomes.forEach((o, i) => {
    const c = cases[i]!;
    mustFindTotal += c.mustFindTotal;
    mustFindMatched += c.mustFindMatched;
    truePositives += c.truePositives;
    if (!o.error) {
      keptTotal += o.kept.length;
      droppedTotal += o.droppedCount;
    }
  });

  const recall = ratio(mustFindMatched, mustFindTotal);
  const precision = ratio(truePositives, keptTotal);
  const citation = ratio(keptTotal, keptTotal + droppedTotal);

  return {
    recall: recall.value,
    precision: precision.value,
    citation_accuracy: citation.value,
    vacuous: {
      recall: recall.vacuous,
      precision: precision.vacuous,
      citation_accuracy: citation.vacuous,
    },
    traces_passed: cases.filter((c) => c.status === 'pass').length,
    traces_total: cases.length,
    cases,
  };
}
