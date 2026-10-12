import type { BriefFactSet, BriefFileFact } from '../../src/modules/brief/facts.js';
import type { BriefGenerationOutput } from '../../src/modules/brief/schemas.js';
import type { Tokenizer } from '../../src/modules/brief/ports.js';

/** Deterministic fake tokenizer: ~4 chars per token. */
export const fakeTokenizer: Tokenizer = { count: (t: string) => Math.ceil(t.length / 4) };

/** Hand-built fact set (all fields of BriefFactSet incl. the five reference Sets).
 *  Defaults: all four inputs available, index `full`, files a.ts/b.ts changed,
 *  caller.ts blast-only. Derived Sets are recomputed unless overridden. */
export function makeFacts(overrides: Partial<BriefFactSet> = {}): BriefFactSet {
  const files: BriefFileFact[] = overrides.files ?? [
    { path: 'src/a.ts', additions: 5, deletions: 1, hunks: [{ start: 10, end: 20 }] },
    { path: 'src/b.ts', additions: 2, deletions: 0, hunks: [{ start: 1, end: 5 }] },
  ];
  const base: BriefFactSet = {
    pr: { number: 7, title: 'Add thing', body: 'Does a thing.', headSha: 'abc1234', base: 'main', additions: 7, deletions: 1, filesCount: files.length },
    intent: { available: true, summary: 'intent summary', resolvedAt: new Date('2026-01-01T00:00:00Z') },
    issue: { available: true, number: 12, title: 'Issue title', body: 'issue body' },
    spec: { available: true, path: 'specs/01-x.md', content: 'spec content' },
    files,
    blast: {
      changedSymbols: [{ file: 'src/a.ts', name: 'doThing', kind: 'function' }],
      callers: [{ file: 'src/caller.ts', symbol: 'callIt', viaSymbol: 'doThing', line: 3, rank: 1 }],
      impactedEndpoints: ['GET /things'],
      crons: [],
      degraded: false,
      indexStatus: 'full',
      indexSha: 'idx1',
      indexerVersion: 1,
    },
    changedFiles: new Set(files.map((f) => f.path)),
    blastFiles: new Set(['src/caller.ts']),
    knownEndpoints: new Set(['GET /things']),
    knownCrons: new Set<string>(),
    knownSymbols: new Set(['doThing', 'callIt']),
    ...overrides,
  };
  return base;
}

/** Raw model output; `as` keeps it valid regardless of schema evolution. */
export function rawOutput(overrides: Record<string, unknown> = {}): BriefGenerationOutput {
  return {
    what: 'Adds a thing.',
    why: 'Because it is needed.',
    summary: 'Adds a thing because it is needed.',
    risk_level: 'low',
    risks: [],
    review_focus: [],
    ...overrides,
  } as BriefGenerationOutput;
}
