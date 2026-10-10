import type { BlastRadius } from '@devdigest/shared';
import type { BlastCallerRow, BlastResult } from '../repo-intel/types.js';

/**
 * Deterministic, numeric one-line summary of a blast radius, e.g.
 * "3 symbols · 7 callers · 2 endpoints · 1 cron". No LLM involved. Symbols are
 * unique by name+file; callers are summed across groups; endpoints/crons are
 * unique across all downstream groups.
 */
export function buildBlastSummary(radius: Pick<BlastRadius, 'changed_symbols' | 'downstream'>): string {
  const symbols = new Set(radius.changed_symbols.map((s) => `${s.name}:${s.file}`)).size;
  const callers = radius.downstream.reduce((n, g) => n + g.callers.length, 0);
  const endpoints = new Set(radius.downstream.flatMap((g) => g.endpoints_affected)).size;
  const crons = new Set(radius.downstream.flatMap((g) => g.crons_affected)).size;
  return [
    `${symbols} ${symbols === 1 ? 'symbol' : 'symbols'}`,
    `${callers} ${callers === 1 ? 'caller' : 'callers'}`,
    `${endpoints} ${endpoints === 1 ? 'endpoint' : 'endpoints'}`,
    `${crons} ${crons === 1 ? 'cron' : 'crons'}`,
  ].join(' · ');
}

/**
 * Pure mapper: groups the flat `callers[]` into `downstream[]` by `viaSymbol`,
 * attaching each group's `endpoints_affected`/`crons_affected` from the facts
 * of that group's OWN caller files (`factsByFile` is keyed by caller file —
 * see `repo-intel/types.ts`'s `BlastResult.factsByFile` doc comment). No LLM
 * call: `summary` is a deterministic numeric string from `buildBlastSummary`.
 * Callers keep the facade's rank-descending order within a group.
 */
export function toBlastRadius(result: BlastResult): BlastRadius {
  const changed_symbols = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  const byViaSymbol = new Map<string, BlastCallerRow[]>();
  for (const c of result.callers) {
    const arr = byViaSymbol.get(c.viaSymbol);
    if (arr) arr.push(c);
    else byViaSymbol.set(c.viaSymbol, [c]);
  }

  const facts = result.factsByFile ?? {};
  const downstream = [...byViaSymbol.entries()].map(([symbol, callers]) => {
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const c of callers) {
      const f = facts[c.file];
      if (!f) continue;
      for (const e of f.endpoints) endpoints.add(e);
      for (const cr of f.crons) crons.add(cr);
    }
    return {
      symbol,
      callers: callers.map((c) => ({ name: c.symbol, file: c.file, line: c.line, rank: c.rank })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    };
  });

  return { changed_symbols, downstream, summary: buildBlastSummary({ changed_symbols, downstream }) };
}
