import { describe, it, expect } from 'vitest';
import {
  applyBudget,
  estimateTotal,
  isBlank,
  isProjectDocPath,
  orderAndDedupe,
  rootOf,
} from '../src/modules/project-context/helpers.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';

describe('orderAndDedupe', () => {
  it('AC-18: own docs first, then skills in order, then in-skill order', () => {
    expect(orderAndDedupe(['D1', 'D2'], [['D3'], ['D4']])).toEqual(['D1', 'D2', 'D3', 'D4']);
  });

  it('AC-17/EC-3: a document shared by agent and skills appears once at its first position', () => {
    expect(orderAndDedupe(['A', 'S'], [['S', 'B'], ['B', 'C']])).toEqual(['A', 'S', 'B', 'C']);
    expect(orderAndDedupe([], [['X'], ['X']])).toEqual(['X']);
  });
});

describe('applyBudget', () => {
  // each doc costs 10 tokens; empty block costs 0
  const count = (d: string[]) => d.length * 10;

  it('AC-34: drops whole documents from the end until the block fits', () => {
    expect(applyBudget(['a', 'b', 'c', 'd'], count, 40)).toEqual({ kept: ['a', 'b', 'c', 'd'], dropped: [] });
    expect(applyBudget(['a', 'b', 'c', 'd'], count, 35)).toEqual({ kept: ['a', 'b', 'c'], dropped: ['d'] });
    expect(applyBudget(['a', 'b', 'c', 'd'], count, 20)).toEqual({ kept: ['a', 'b'], dropped: ['c', 'd'] });
  });

  it('EC-13: a first document over budget on its own drops everything', () => {
    expect(applyBudget(['a', 'b'], count, 5)).toEqual({ kept: [], dropped: ['a', 'b'] });
  });
});

describe('isBlank', () => {
  it('AC-36/EC-6: empty and whitespace-only are blank, real text is not', () => {
    expect(isBlank('')).toBe(true);
    expect(isBlank(' \n\t\r\n ')).toBe(true);
    expect(isBlank(' # x ')).toBe(false);
  });
});

describe('estimateTotal', () => {
  const overhead = { heading_tokens: 5, separator_tokens: 2 };
  it('is 0 for no documents, else heading + sum + separators between documents', () => {
    expect(estimateTotal(overhead, [])).toBe(0);
    expect(estimateTotal(overhead, [10])).toBe(15);
    expect(estimateTotal(overhead, [10, 20, 30])).toBe(5 + 60 + 4);
  });
});

describe('rootOf / isProjectDocPath', () => {
  it('rootOf maps the first segment to a known root or null', () => {
    expect(rootOf('specs/a.md')).toBe('specs');
    expect(rootOf('docs/a/b.md')).toBe('docs');
    expect(rootOf('insights/x.md')).toBe('insights');
    expect(rootOf('src/a.md')).toBeNull();
    expect(rootOf('README.md')).toBeNull();
  });

  it('AC-2/AC-35: accepts only safe .md paths under a root, outside ignored dirs', () => {
    expect(isProjectDocPath('docs/a/b.md')).toBe(true);
    expect(isProjectDocPath('docs/A.MD')).toBe(true);
    expect(isProjectDocPath('README.md')).toBe(false);
    expect(isProjectDocPath('docs/a.txt')).toBe(false);
    expect(isProjectDocPath('docs')).toBe(false);
    expect(isProjectDocPath('docs/node_modules/x/readme.md')).toBe(false);
    expect(isProjectDocPath('docs/../../etc/passwd.md')).toBe(false);
    expect(isProjectDocPath('/docs/a.md')).toBe(false);
  });
});

describe('real tokenizer', () => {
  it('AC-22: equal-length prose and Cyrillic text give different token counts', () => {
    const t = new TiktokenTokenizer();
    const prose = 'the quick brown fox jumps over the lazy dog again';
    const cyr = 'я'.repeat(prose.length);
    expect(cyr.length).toBe(prose.length);
    expect(t.count(cyr)).not.toBe(t.count(prose));
  });
});
