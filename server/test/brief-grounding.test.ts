import { describe, it, expect } from 'vitest';
import { groundBrief } from '../src/modules/brief/grounding.js';
import { hunkRangesFor } from '../src/modules/brief/hunks.js';
import { makeFacts, rawOutput } from './helpers/brief-fixtures.js';

const sentenceCount = (s: string): number => (s.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? []).length;

describe('groundBrief — risks (SPEC-04 AC-9, EC-5)', () => {
  it('AC-9/EC-5: drops a risk whose refs are all unknown, lists its title, and keeps a blast-only ref risk', () => {
    const facts = makeFacts();
    const risk = (title: string, file: string) => ({
      kind: 'other',
      title,
      explanation: 'because',
      severity: 'low',
      file_refs: [{ file }],
    });

    const mixed = groundBrief(rawOutput({ risks: [risk('Ghost', 'nope/ghost.ts'), risk('BlastOnly', 'src/caller.ts')] }), facts);
    expect(mixed.brief.risks.map((r) => r.title)).toEqual(['BlastOnly']);
    expect(mixed.dropped.risks).toEqual(['Ghost']);
    expect(mixed.dropped.paths).toContain('nope/ghost.ts');

    const allGone = groundBrief(rawOutput({ risks: [risk('Ghost1', 'x/1.ts'), risk('Ghost2', 'x/2.ts')] }), facts);
    expect(allGone.brief.risks).toEqual([]);
    expect(allGone.dropped.risks).toEqual(['Ghost1', 'Ghost2']);
  });
});

describe('groundBrief — review focus (SPEC-04 AC-10, AC-11, EC-4)', () => {
  it('AC-10/EC-4: changed-file focus items survive; null / out-of-hunk lines become line:null', () => {
    const facts = makeFacts({
      files: [{ path: 'src/a.ts', additions: 5, deletions: 0, hunks: hunkRangesFor('@@ -1,3 +10,11 @@\n+x') }],
    });
    const { brief, dropped } = groundBrief(
      rawOutput({
        review_focus: [
          { file: 'src/a.ts', line: 12, reason: 'valid line' },
          { file: 'src/a.ts', line: null, reason: 'no line' },
          { file: 'src/a.ts', line: 999, reason: 'outside hunks' },
        ],
      }),
      facts,
    );
    expect(brief.review_focus.map((f) => f.line)).toEqual([12, null, null]);
    expect(brief.review_focus).toHaveLength(3);
    expect(dropped.focus).toEqual([]);
    expect(dropped.lines).toEqual(['src/a.ts:999']);
  });

  it('AC-11: focus items on a blast-only or unknown file are dropped and listed', () => {
    const { brief, dropped } = groundBrief(
      rawOutput({
        review_focus: [
          { file: 'src/caller.ts', line: 3, reason: 'blast only' },
          { file: 'unknown/file.ts', reason: 'unknown' },
          { file: 'src/a.ts', reason: 'ok' },
        ],
      }),
      makeFacts(),
    );
    expect(brief.review_focus.map((f) => f.file)).toEqual(['src/a.ts']);
    expect(dropped.focus).toEqual(['src/caller.ts', 'unknown/file.ts']);
  });
});

describe('groundBrief — summary (SPEC-04 AC-1, AC-2, EC-2, A2)', () => {
  it('AC-2: neutralises external links and drops unknown symbol citations in the summary', () => {
    const { brief, dropped } = groundBrief(
      rawOutput({ summary: 'See [x](https://evil.test) and `fooBar` for details.' }),
      makeFacts(),
    );
    expect(brief.summary).toBe('See x and fooBar for details.');
    expect(brief.summary).not.toContain('evil.test');
    expect(dropped.links).toContain('https://evil.test');
    expect(dropped.citations).toContain('fooBar');
  });

  it('AC-1/EC-2: a 5-sentence summary is clamped to 3 sentences; what/why still clamp to 2', () => {
    const { brief } = groundBrief(
      rawOutput({
        summary: 'One. Two. Three. Four. Five.',
        what: 'W1. W2. W3. W4.',
        why: 'Y1. Y2. Y3.',
      }),
      makeFacts(),
    );
    expect(brief.summary).toBe('One. Two. Three.');
    expect(brief.what).toBe('W1. W2.');
    expect(brief.why).toBe('Y1. Y2.');
  });

  it('A2: a summary that grounds to empty falls back to a non-empty what+why of at most 3 sentences', () => {
    const { brief } = groundBrief(
      rawOutput({ summary: '[](https://evil.test)', what: 'W1. W2.', why: 'Y1. Y2.' }),
      makeFacts(),
    );
    expect(brief.summary).toBeTruthy();
    expect(brief.summary!.trim().length).toBeGreaterThan(0);
    expect(sentenceCount(brief.summary!)).toBeLessThanOrEqual(3);
    expect(brief.summary).toBe('W1. W2. Y1.');
  });

  it('groundBrief never sets missing_inputs (server computes it elsewhere)', () => {
    const { brief } = groundBrief(rawOutput(), makeFacts());
    expect(brief.missing_inputs).toBeUndefined();
  });
});
