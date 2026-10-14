import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { extractFileSnippet, splitDiffByFile } from '../src/modules/eval/pipeline/snippet.js';
import { validateCase } from '../src/modules/eval/pipeline/validate.js';
import { deriveCaseName } from '../src/modules/eval/pipeline/naming.js';

/** SPEC-06 AC-4 (snippet), AC-7 (naming), AC-44 – AC-46 (validation). */

const twoFileDiff = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -10,3 +10,4 @@',
  ' export const config = {',
  '   port: 3000,',
  '+  stripeKey: "sk_live_x",',
  ' };',
  'diff --git a/src/other.ts b/src/other.ts',
  '--- a/src/other.ts',
  '+++ b/src/other.ts',
  '@@ -1,1 +1,2 @@',
  ' a',
  '+b',
].join('\n');

/** One file, three hunks, ~600 diff lines in total. */
function bigDiff(): string {
  const out = ['diff --git a/src/big.ts b/src/big.ts', '--- a/src/big.ts', '+++ b/src/big.ts'];
  for (const start of [1, 1000, 2000]) {
    out.push(`@@ -${start},200 +${start},200 @@`);
    for (let i = 0; i < 200; i++) out.push(`+line ${start + i}`);
  }
  return out.join('\n');
}

describe('snippet extraction (AC-3, AC-4)', () => {
  it('splits a raw diff into files keyed by the +++ path', () => {
    expect(splitDiffByFile(twoFileDiff).map((s) => s.path)).toEqual(['src/config.ts', 'src/other.ts']);
  });

  it('handles bare ---/+++ diffs without a diff --git line', () => {
    const bare = ['--- a/x.ts', '+++ b/x.ts', '@@ -1,1 +1,1 @@', '+y', '--- a/z.ts', '+++ b/z.ts', '@@ -1 +1 @@', '+q'].join('\n');
    expect(splitDiffByFile(bare).map((s) => s.path)).toEqual(['x.ts', 'z.ts']);
  });

  it('returns only the finding file section when small', () => {
    const s = extractFileSnippet(twoFileDiff, 'src/config.ts', 12, 12)!;
    expect(s).toContain('+++ b/src/config.ts');
    expect(s).toContain('stripeKey');
    expect(s).not.toContain('src/other.ts');
  });

  it('keeps only overlapping hunks when the file diff exceeds 400 lines', () => {
    const s = extractFileSnippet(bigDiff(), 'src/big.ts', 1050, 1052)!;
    expect(s).toContain('+++ b/src/big.ts');
    expect(s).toContain('@@ -1000,200 +1000,200 @@');
    expect(s).not.toContain('@@ -1,200');
    expect(s).not.toContain('@@ -2000,200');
  });

  it('returns null when the file is not in the diff', () => {
    expect(extractFileSnippet(twoFileDiff, 'src/missing.ts', 1, 1)).toBeNull();
  });
});

describe('validateCase (AC-44 – AC-46)', () => {
  const diff = parseUnifiedDiff(twoFileDiff);
  const ok = { inputDiff: twoFileDiff, inputFiles: [], expectations: [] };

  it('accepts a valid case', () => {
    const e = { type: 'must_find' as const, file: 'src/config.ts', start_line: 12, end_line: 12 };
    expect(validateCase({ ...ok, expectations: [e] }, diff)).toEqual([]);
  });

  it('rejects a diff without hunks', () => {
    const errs = validateCase({ ...ok, inputDiff: 'just prose' }, parseUnifiedDiff('just prose'));
    expect(errs.map((e) => e.message)).toContain('Diff must contain at least one file hunk');
  });

  it('rejects an expectation on a file outside the diff, naming its index', () => {
    const errs = validateCase(
      { ...ok, expectations: [{ type: 'must_find', file: 'src/nope.ts', start_line: 1, end_line: 1 }] },
      diff,
    );
    expect(errs[0]).toMatchObject({ field: 'expectations[0]' });
    expect(errs[0]!.message).toContain('not in the diff');
  });

  it('rejects an expectation on lines outside the hunks', () => {
    const errs = validateCase(
      { ...ok, expectations: [{ type: 'must_not_flag', file: 'src/config.ts', start_line: 900, end_line: 905 }] },
      diff,
    );
    expect(errs[0]!.message).toContain('outside the diff hunks');
  });

  it('rejects start > end, too many expectations/files, oversized and duplicate files', () => {
    const e = { type: 'must_find' as const, file: 'src/config.ts', start_line: 12, end_line: 12 };
    expect(validateCase({ ...ok, expectations: [{ ...e, start_line: 13, end_line: 12 }] }, diff)[0]!.message).toContain(
      'start line is after end line',
    );
    expect(validateCase({ ...ok, expectations: Array(11).fill(e) }, diff).some((x) => x.field === 'expectations')).toBe(true);
    const files = Array.from({ length: 11 }, (_, i) => ({ path: `f${i}.ts`, content: '' }));
    expect(validateCase({ ...ok, inputFiles: files }, diff).some((x) => x.field === 'input_files')).toBe(true);
    const big = { path: 'big.ts', content: 'x'.repeat(100_001) };
    expect(validateCase({ ...ok, inputFiles: [big] }, diff)[0]!.field).toBe('input_files[0].content');
    const dup = [{ path: 'a.ts', content: '' }, { path: './a.ts', content: '' }];
    expect(validateCase({ ...ok, inputFiles: dup }, diff)[0]!.message).toContain('Duplicate file path');
    expect(validateCase({ ...ok, inputDiff: twoFileDiff + 'x'.repeat(200_001) }, diff)[0]!.field).toBe('input_diff');
  });
});

describe('deriveCaseName (AC-7)', () => {
  it('builds category-basename-line in kebab case', () => {
    expect(deriveCaseName('security', 'src/config.ts', 12, [])).toBe('security-config-ts-l12');
  });

  it('suffixes -2, -3 on clashes', () => {
    expect(deriveCaseName('security', 'src/config.ts', 12, ['security-config-ts-l12'])).toBe('security-config-ts-l12-2');
    expect(
      deriveCaseName('security', 'src/config.ts', 12, ['security-config-ts-l12', 'security-config-ts-l12-2']),
    ).toBe('security-config-ts-l12-3');
  });

  it('caps the name at 60 characters', () => {
    const name = deriveCaseName('performance', `src/${'very-long-file-name-'.repeat(6)}.ts`, 1234, []);
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name.endsWith('-l1234')).toBe(true);
  });
});
