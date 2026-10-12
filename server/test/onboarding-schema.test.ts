import { describe, it, expect } from 'vitest';
import { OnboardingLlmOutput } from '../src/modules/onboarding/schemas.js';
import { diagnoseInvalidOutput, rawOutputOf, validateLlmOutput } from '../src/modules/onboarding/helpers.js';
import type { ValidationContext } from '../src/modules/onboarding/types.js';

const good = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  architecture: { summary_markdown: 'A tidy service.', diagram: null },
  critical_paths: [{ path: 'src/a.ts', role: 'entry' }],
  run_locally: [{ command: 'pnpm install', note: 'deps' }],
  reading_path: [{ path: 'src/b.ts', reason: 'central' }],
  first_tasks: [{ title: 'T1', rationale: 'why', files: ['src/a.ts'] }],
  ...over,
});

describe('OnboardingLlmOutput tolerance (AC-15, AC-18)', () => {
  const ctx: ValidationContext = {
    indexPaths: new Set(['src/a.ts', 'src/b.ts']),
    commands: [{ command: 'pnpm install', kind: 'install', source: 'package.json' }],
    readingPaths: ['src/b.ts'],
    criticalPaths: ['src/a.ts'],
  };

  it('clamps over-long strings, slices over-long arrays and defaults omitted optional fields', () => {
    const r = OnboardingLlmOutput.safeParse({
      architecture: { summary_markdown: 'x'.repeat(5000) }, // diagram omitted
      critical_paths: Array.from({ length: 15 }, (_, i) => ({ path: `src/f${i}.ts` })), // role omitted
      run_locally: [{ command: 'pnpm install' }], // note omitted
      reading_path: [{ path: 'src/b.ts', reason: 'r'.repeat(400) }],
      first_tasks: [{ title: 'T'.repeat(200), files: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }], // rationale omitted
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.architecture.summary_markdown).toHaveLength(4000);
    expect(r.data.architecture.diagram).toBeNull();
    expect(r.data.critical_paths).toHaveLength(10);
    expect(r.data.critical_paths[0]!.role).toBe('');
    expect(r.data.run_locally[0]!.note).toBe('');
    expect(r.data.reading_path[0]!.reason).toHaveLength(300);
    expect(r.data.first_tasks[0]!.title).toHaveLength(120);
    expect(r.data.first_tasks[0]!.rationale).toBe('');
    expect(r.data.first_tasks[0]!.files).toHaveLength(5);
  });

  it('AC-18: a task with files omitted parses (files = []) and is then dropped by grounding', () => {
    const parsed = OnboardingLlmOutput.safeParse(
      good({
        first_tasks: [
          { title: 'No files', rationale: 'r' },
          { title: 'Real 1', rationale: 'r', files: ['src/a.ts'] },
          { title: 'Real 2', rationale: 'r', files: ['src/b.ts'] },
          { title: 'Real 3', rationale: 'r', files: ['src/a.ts'] },
        ],
      }),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.first_tasks[0]!.files).toEqual([]);
    const v = validateLlmOutput(parsed.data, ctx);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.firstTasks.map((t) => t.title)).toEqual(['Real 1', 'Real 2', 'Real 3']);
  });

  it('AC-15: output that is not the five-section structure still fails', () => {
    expect(OnboardingLlmOutput.safeParse({ foo: 1 }).success).toBe(false);
    expect(OnboardingLlmOutput.safeParse('text').success).toBe(false);
    expect(OnboardingLlmOutput.safeParse(good({ architecture: 'not-an-object' })).success).toBe(false);
    expect(OnboardingLlmOutput.safeParse(good({ critical_paths: 'nope' })).success).toBe(false);
    const { first_tasks: _omit, ...missing } = good();
    expect(OnboardingLlmOutput.safeParse(missing).success).toBe(false);
    // identifying keys stay required
    expect(OnboardingLlmOutput.safeParse(good({ critical_paths: [{ role: 'no path' }] })).success).toBe(false);
  });
});

describe('diagnoseInvalidOutput / rawOutputOf (AC-15, NFR-5)', () => {
  it('truncated / non-JSON text is reported as not valid JSON with its length', () => {
    const raw = '{"architecture":{"summary_markdown":"cut off he';
    const d = diagnoseInvalidOutput(raw)!;
    expect(d).toMatch(/not valid JSON/i);
    expect(d).toMatch(/truncated/i);
    expect(d).toContain(`${raw.length} chars`);
    expect(d).not.toContain('cut off he');
  });

  it('schema mismatch lists field paths and issue codes, never values (NFR-5)', () => {
    const MARK = 'SECRET_MARKER_8f3a';
    const d = diagnoseInvalidOutput(JSON.stringify(good({ architecture: MARK, critical_paths: [{ path: 5, role: MARK }] })))!;
    expect(d).toMatch(/architecture: invalid_type/);
    expect(d).toMatch(/critical_paths\.0\.path: invalid_type/);
    expect(d).not.toContain(MARK);
  });

  it('caps at 5 issues with a (+N more) suffix and clips to 300 chars', () => {
    const many = diagnoseInvalidOutput(JSON.stringify({ a: 1 }))!; // 5 missing sections -> exactly 5, no suffix
    expect(many).not.toMatch(/more\)/);
    const tasks = Array.from({ length: 8 }, () => ({ rationale: 'r', files: [] })); // 8 missing titles
    const d = diagnoseInvalidOutput(JSON.stringify(good({ first_tasks: tasks })))!;
    expect(d).toMatch(/\(\+3 more\)$/);
    const longKeys = JSON.stringify(
      good({ first_tasks: [{ title: 1, rationale: 'r', files: Array.from({ length: 3 }, () => 1) }], ['k'.repeat(1)]: 1 }),
    );
    expect(diagnoseInvalidOutput(longKeys)!.length).toBeLessThanOrEqual(300);
    // a long garbage text still yields a clipped message
    expect(diagnoseInvalidOutput('x'.repeat(100000))!.length).toBeLessThanOrEqual(300);
  });

  it('returns null for non-string raw and for output that actually parses', () => {
    expect(diagnoseInvalidOutput(undefined)).toBeNull();
    expect(diagnoseInvalidOutput({ a: 1 })).toBeNull();
    expect(diagnoseInvalidOutput(JSON.stringify(good()))).toBeNull();
  });

  it('rawOutputOf reads err.details.raw and is undefined without details', () => {
    expect(rawOutputOf({ details: { raw: 'abc' } })).toBe('abc');
    expect(rawOutputOf(new Error('x'))).toBeUndefined();
    expect(rawOutputOf({ details: 'str' })).toBeUndefined();
    expect(rawOutputOf(null)).toBeUndefined();
  });
});
