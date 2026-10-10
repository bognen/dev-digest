import { describe, expect, it } from 'vitest';
import { BlastRadius, BlastRadiusResponse } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';
import { buildBlastSummary, toBlastRadius } from './helpers.js';

/** Pure mapper tests — no ports, no DB. */

const base = (over: Partial<BlastResult> = {}): BlastResult => ({
  changedSymbols: [],
  callers: [],
  impactedEndpoints: [],
  degraded: false,
  ...over,
});

describe('toBlastRadius', () => {
  it('groups callers by viaSymbol, attributes endpoints/crons only from the group\'s own caller files, de-duplicates, keeps rank order, and passes the contracts', () => {
    const result = toBlastRadius(
      base({
        changedSymbols: [
          { file: 'src/a.ts', name: 'alpha', kind: 'function' },
          { file: 'src/b.ts', name: 'beta', kind: 'class' },
          { file: 'src/c.ts', name: 'lonely', kind: 'function' },
        ],
        callers: [
          { file: 'src/api/one.ts', symbol: 'h1', viaSymbol: 'alpha', line: 3, rank: 9 },
          { file: 'src/api/two.ts', symbol: 'h2', viaSymbol: 'beta', line: 4, rank: 8 },
          { file: 'src/api/three.ts', symbol: 'h3', viaSymbol: 'alpha', line: 5, rank: 2 },
          // via a symbol that is NOT in changed_symbols — still forms a group
          { file: 'src/api/four.ts', symbol: 'h4', viaSymbol: 'ghost', line: 6, rank: 1 },
        ],
        impactedEndpoints: ['GET /one', 'POST /two'],
        factsByFile: {
          'src/api/one.ts': { endpoints: ['GET /one'], crons: [] },
          'src/api/three.ts': { endpoints: ['GET /one'], crons: ['nightly'] }, // duplicate endpoint
          'src/api/two.ts': { endpoints: ['POST /two'], crons: [] },
        },
      }),
    );

    expect(result.changed_symbols.map((s) => s.name)).toEqual(['alpha', 'beta', 'lonely']);
    expect(result.downstream.map((g) => g.symbol)).toEqual(['alpha', 'beta', 'ghost']);

    const [alpha, beta, ghost] = result.downstream;
    expect(alpha!.callers.map((c) => c.name)).toEqual(['h1', 'h3']);
    expect(alpha!.callers[0]).toEqual({ name: 'h1', file: 'src/api/one.ts', line: 3, rank: 9 });
    expect(alpha!.endpoints_affected).toEqual(['GET /one']);
    expect(alpha!.crons_affected).toEqual(['nightly']);
    // beta must NOT inherit alpha's endpoints/crons
    expect(beta!.endpoints_affected).toEqual(['POST /two']);
    expect(beta!.crons_affected).toEqual([]);
    expect(ghost!.callers).toHaveLength(1);
    expect(ghost!.endpoints_affected).toEqual([]);

    expect(() => BlastRadius.parse(result)).not.toThrow();
    expect(() => BlastRadiusResponse.parse({ status: 'full', data: result })).not.toThrow();
  });

  it('a changed symbol with zero callers has no downstream group but stays in changed_symbols', () => {
    const result = toBlastRadius(
      base({ changedSymbols: [{ file: 'src/a.ts', name: 'alone', kind: 'function' }] }),
    );
    expect(result.changed_symbols).toEqual([{ name: 'alone', file: 'src/a.ts', kind: 'function' }]);
    expect(result.downstream).toEqual([]);
  });

  it('absent factsByFile (degraded path) yields empty endpoints/crons without throwing', () => {
    const run = () =>
      toBlastRadius(
        base({
          degraded: true,
          reason: 'flag_off',
          changedSymbols: [{ file: 'src/a.ts', name: 'alpha', kind: 'function' }],
          callers: [{ file: 'src/x.ts', symbol: 'h', viaSymbol: 'alpha', line: 1, rank: 0 }],
          impactedEndpoints: ['GET /flat'],
        }),
      );
    expect(run).not.toThrow();
    const g = run().downstream[0]!;
    expect(g.endpoints_affected).toEqual([]);
    expect(g.crons_affected).toEqual([]);
  });
});

describe('buildBlastSummary', () => {
  const sym = (name: string, file = 'f.ts') => ({ name, file, kind: 'function' });
  const grp = (symbol: string, callers: number, endpoints: string[] = [], crons: string[] = []) => ({
    symbol,
    callers: Array.from({ length: callers }, (_, i) => ({ name: `c${i}`, file: `x${i}.ts`, line: i + 1, rank: 0 })),
    endpoints_affected: endpoints,
    crons_affected: crons,
  });

  it('produces exact strings for all-zero, singular and plural counts', () => {
    expect(buildBlastSummary({ changed_symbols: [], downstream: [] })).toBe(
      '0 symbols · 0 callers · 0 endpoints · 0 crons',
    );
    expect(
      buildBlastSummary({ changed_symbols: [sym('a')], downstream: [grp('a', 1, ['GET /x'], ['nightly'])] }),
    ).toBe('1 symbol · 1 caller · 1 endpoint · 1 cron');
    expect(
      buildBlastSummary({
        changed_symbols: [sym('a'), sym('b'), sym('c')],
        downstream: [grp('a', 4, ['GET /x', 'GET /y'], ['n']), grp('b', 3, ['GET /x'], [])],
      }),
    ).toBe('3 symbols · 7 callers · 2 endpoints · 1 cron');
  });
});
