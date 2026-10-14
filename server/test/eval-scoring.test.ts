import { describe, it, expect } from 'vitest';
import type { EvalExpectation, Finding } from '@devdigest/shared';
import {
  normalizePath,
  rangesOverlap,
  findingMatches,
  scoreCase,
  scoreRun,
  type CaseOutcomeInput,
} from '../src/modules/eval/pipeline/scoring.js';

/** SPEC-06 AC-20 – AC-26, NFR-2: code-only scoring. */

let seq = 0;
function finding(file: string, start: number, end = start): Finding {
  seq++;
  return {
    id: `f${seq}`,
    severity: 'WARNING',
    category: 'bug',
    title: `finding ${seq}`,
    file,
    start_line: start,
    end_line: end,
    rationale: 'r',
    confidence: 0.9,
    kind: 'finding',
  } as Finding;
}

function exp(id: string, type: EvalExpectation['type'], file: string, start: number, end = start): EvalExpectation {
  return { id, type, file, start_line: start, end_line: end };
}

describe('normalizePath / rangesOverlap / findingMatches (AC-20)', () => {
  it('strips ./, a/ and b/ prefixes', () => {
    expect(normalizePath('./src/x.ts')).toBe('src/x.ts');
    expect(normalizePath('a/src/x.ts')).toBe('src/x.ts');
    expect(normalizePath('b/src/x.ts')).toBe('src/x.ts');
    expect(normalizePath('src/x.ts')).toBe('src/x.ts');
  });

  it.each([
    [10, 11, 12, 12, false], // adjacent, not overlapping
    [10, 12, 12, 14, true], // touching edge
    [12, 12, 12, 12, true], // identical single line
    [5, 20, 10, 11, true], // containment
    [12, 10, 11, 11, true], // reversed range normalised
    [1, 3, 4, 9, false],
  ])('[%i,%i] vs [%i,%i] → %s', (a, b, c, d, want) => {
    expect(rangesOverlap(a, b, c, d)).toBe(want);
  });

  it('matches only on the same file', () => {
    const e = exp('e', 'must_find', 'src/config.ts', 12);
    expect(findingMatches(finding('b/src/config.ts', 12), e)).toBe(true);
    expect(findingMatches(finding('src/other.ts', 12), e)).toBe(false);
  });
});

describe('scoreCase pass rules (AC-25)', () => {
  const mf = exp('mf', 'must_find', 'src/a.ts', 10);
  const mnf = exp('mnf', 'must_not_flag', 'src/a.ts', 30);

  it('must_find hit → pass', () => {
    const s = scoreCase({ expectations: [mf], kept: [finding('src/a.ts', 9, 11)], droppedCount: 0 });
    expect(s.status).toBe('pass');
    expect(s.matched).toEqual(['mf']);
  });

  it('must_find miss → fail', () => {
    const s = scoreCase({ expectations: [mf], kept: [finding('src/a.ts', 40)], droppedCount: 0 });
    expect(s.status).toBe('fail');
    expect(s.unmatched).toEqual(['mf']);
  });

  it('must_not_flag hit → fail; left clean → pass', () => {
    expect(scoreCase({ expectations: [mnf], kept: [finding('src/a.ts', 30)], droppedCount: 0 }).status).toBe('fail');
    expect(scoreCase({ expectations: [mnf], kept: [finding('src/a.ts', 5)], droppedCount: 0 }).status).toBe('pass');
  });

  it('empty-expectation (clean) case passes only with zero findings', () => {
    expect(scoreCase({ expectations: [], kept: [], droppedCount: 0 }).status).toBe('pass');
    expect(scoreCase({ expectations: [], kept: [finding('src/a.ts', 1)], droppedCount: 0 }).status).toBe('fail');
  });

  it('errored case → error, every expectation unmatched', () => {
    const s = scoreCase({ expectations: [mf, mnf], kept: [], droppedCount: 0, error: 'boom' });
    expect(s.status).toBe('error');
    expect(s.unmatched).toEqual(['mf', 'mnf']);
    expect(s.mustFindTotal).toBe(1);
    expect(s.mustFindMatched).toBe(0);
  });
});

describe('scoreRun metrics', () => {
  it('recall = matched must_find / all must_find (AC-21: 3 of 4 → 0.75)', () => {
    const outcomes: CaseOutcomeInput[] = [1, 2, 3, 4].map((n) => ({
      expectations: [exp(`e${n}`, 'must_find', 'src/a.ts', n * 10)],
      kept: n <= 3 ? [finding('src/a.ts', n * 10)] : [],
      droppedCount: 0,
    }));
    expect(scoreRun(outcomes).recall).toBe(0.75);
  });

  it('precision counts every non-matching kept finding as noise (AC-22: 1/3)', () => {
    const r = scoreRun([
      {
        expectations: [exp('a', 'must_find', 'src/a.ts', 10)],
        kept: [finding('src/a.ts', 10), finding('src/a.ts', 50)],
        droppedCount: 0,
      },
      { expectations: [exp('b', 'must_not_flag', 'src/b.ts', 5)], kept: [finding('src/b.ts', 5)], droppedCount: 0 },
    ]);
    expect(r.precision).toBeCloseTo(1 / 3, 10);
    expect(r.vacuous.precision).toBe(false);
  });

  it('a finding matching another case\'s target is still noise in its own case', () => {
    const r = scoreRun([
      { expectations: [exp('a', 'must_find', 'src/a.ts', 10)], kept: [], droppedCount: 0 },
      { expectations: [], kept: [finding('src/a.ts', 10)], droppedCount: 0 },
    ]);
    expect(r.precision).toBe(0);
  });

  it('citation accuracy = kept / (kept + dropped) (AC-23: 8/10)', () => {
    const r = scoreRun([
      { expectations: [], kept: Array.from({ length: 8 }, (_, i) => finding('src/a.ts', i + 1)), droppedCount: 2 },
    ]);
    expect(r.citation_accuracy).toBe(0.8);
  });

  it('zero denominators → 1.0 flagged vacuous (AC-24)', () => {
    const r = scoreRun([{ expectations: [exp('n', 'must_not_flag', 'src/a.ts', 3)], kept: [], droppedCount: 0 }]);
    expect(r).toMatchObject({
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      vacuous: { recall: true, precision: true, citation_accuracy: true },
    });
  });

  it('errored cases contribute misses to recall but no findings', () => {
    const r = scoreRun([
      { expectations: [exp('a', 'must_find', 'src/a.ts', 1)], kept: [finding('src/a.ts', 1)], droppedCount: 1 },
      { expectations: [exp('b', 'must_find', 'src/a.ts', 9)], kept: [], droppedCount: 5, error: 'timeout' },
    ]);
    expect(r.recall).toBe(0.5);
    expect(r.citation_accuracy).toBe(0.5); // the errored case's dropped count is ignored
    expect(r.traces_passed).toBe(1);
    expect(r.traces_total).toBe(2);
  });

  it('is deterministic over 100 evaluations (NFR-2)', () => {
    const outcomes: CaseOutcomeInput[] = [
      {
        expectations: [exp('a', 'must_find', 'src/a.ts', 10), exp('b', 'must_not_flag', 'src/a.ts', 40)],
        kept: [finding('src/a.ts', 10), finding('src/a.ts', 40), finding('src/a.ts', 70)],
        droppedCount: 3,
      },
    ];
    const first = JSON.stringify(scoreRun(outcomes));
    for (let i = 0; i < 100; i++) expect(JSON.stringify(scoreRun(outcomes))).toBe(first);
  });
});

/**
 * AC-57 — tests added for the mutants Stryker reported as SURVIVED on the first
 * `pnpm mutation:eval` run (docs/evals/mutation-testing.md). Each test names the mutant it kills.
 */
describe('mutation killers (Stryker survivors)', () => {
  it('normalizePath trims whitespace (kills: removed .trim())', () => {
    expect(normalizePath('  src/x.ts \n')).toBe('src/x.ts');
  });

  it('normalizePath turns backslashes into slashes (kills: replace(/\\/g, ""))', () => {
    expect(normalizePath(['src', 'modules', 'x.ts'].join('\\'))).toBe('src/modules/x.ts');
  });

  it('rangesOverlap normalises a reversed SECOND range (kills: bHi = Math.min)', () => {
    expect(rangesOverlap(10, 10, 12, 8)).toBe(true);
  });

  it('an errored case satisfies nothing (kills: matched: ["…"] on error)', () => {
    const s = scoreCase({ expectations: [exp('n', 'must_not_flag', 'src/a.ts', 3)], kept: [], droppedCount: 0, error: 'x' });
    expect(s.matched).toEqual([]);
  });

  it('one finding on a must_not_flag range fails it even when others are clean (kills: some → every)', () => {
    const s = scoreCase({
      expectations: [exp('n', 'must_not_flag', 'src/a.ts', 30)],
      kept: [finding('src/a.ts', 30), finding('src/a.ts', 90)],
      droppedCount: 0,
    });
    expect(s.status).toBe('fail');
    expect(s.unmatched).toEqual(['n']);
  });

  it('traces_passed counts passing cases, not the others (kills: === → !==)', () => {
    const pass = { expectations: [exp('p', 'must_find', 'src/a.ts', 1)], kept: [finding('src/a.ts', 1)], droppedCount: 0 };
    const fail = { expectations: [exp('f', 'must_find', 'src/a.ts', 5)], kept: [], droppedCount: 0 };
    const r = scoreRun([pass, { ...pass }, fail]);
    expect(r.traces_passed).toBe(2);
    expect(r.traces_total).toBe(3);
  });
});
