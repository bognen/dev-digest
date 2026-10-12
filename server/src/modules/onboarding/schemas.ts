import { z } from 'zod';

/**
 * The STRICT, provider-facing shape — the five sections, in order (field order
 * is load-bearing for the models). Every field is required here because strict
 * `json_schema` mode needs it; `OnboardingLlmOutput` below is what actually
 * parses the answer and is tolerant of near-misses. `files` has no `.min(1)`:
 * a task with no real files is dropped by grounding (AC-18), not a parse failure.
 */
const OnboardingLlmShape = z.object({
  architecture: z.object({
    summary_markdown: z.string().max(4000),
    diagram: z.string().max(4000).nullable(),
  }),
  critical_paths: z.array(z.object({ path: z.string().max(500), role: z.string().max(200) })).max(10),
  run_locally: z.array(z.object({ command: z.string().max(500), note: z.string().max(200) })).max(20),
  reading_path: z.array(z.object({ path: z.string().max(500), reason: z.string().max(300) })).max(20),
  first_tasks: z
    .array(
      z.object({
        title: z.string().max(120),
        rationale: z.string().max(600),
        files: z.array(z.string().max(500)).max(5),
      }),
    )
    .max(10),
});

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clipStr = (v: unknown, n: number): unknown => (typeof v === 'string' && v.length > n ? v.slice(0, n) : v);
const cap = (v: unknown, n: number): unknown => (Array.isArray(v) ? v.slice(0, n) : v);
const entries = (v: unknown, n: number, f: (e: Record<string, unknown>) => Record<string, unknown>): unknown =>
  Array.isArray(v) ? v.slice(0, n).map((e) => (isRecord(e) ? f(e) : e)) : v;

/**
 * Local tolerance (pure): over-long strings are truncated, over-long arrays
 * sliced, and the optional fields (`diagram`, `note`, `files`) defaulted. The
 * five top-level sections and the entry keys that carry meaning stay required,
 * so output that is not the five-section structure still fails (AC-15).
 */
export function normalizeLlmOutput(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const arch = raw.architecture;
  return {
    ...raw,
    architecture: isRecord(arch)
      ? { ...arch, summary_markdown: clipStr(arch.summary_markdown, 4000), diagram: clipStr(arch.diagram ?? null, 4000) }
      : arch,
    critical_paths: entries(raw.critical_paths, 10, (e) => ({
      ...e,
      path: clipStr(e.path, 500),
      role: clipStr(e.role ?? '', 200),
    })),
    run_locally: entries(raw.run_locally, 20, (e) => ({
      ...e,
      command: clipStr(e.command, 500),
      note: clipStr(e.note ?? '', 200),
    })),
    reading_path: entries(raw.reading_path, 20, (e) => ({
      ...e,
      path: clipStr(e.path, 500),
      reason: clipStr(e.reason ?? '', 300),
    })),
    first_tasks: entries(raw.first_tasks, 10, (e) => ({
      ...e,
      title: clipStr(e.title, 120),
      rationale: clipStr(e.rationale ?? '', 600),
      files: Array.isArray(e.files)
        ? (cap(e.files, 5) as unknown[]).map((f) => clipStr(f, 500))
        : e.files === undefined || e.files === null
          ? []
          : e.files,
    })),
  };
}

/**
 * Passed to the provider AND used to parse its answer. The preprocess step is
 * invisible to JSON-schema generation (it reads the strict input shape, so the
 * provider still gets required fields + caps) while local parsing is tolerant.
 */
export const OnboardingLlmOutput = z.preprocess(normalizeLlmOutput, OnboardingLlmShape) as z.ZodType<
  z.infer<typeof OnboardingLlmShape>,
  z.ZodTypeDef,
  z.infer<typeof OnboardingLlmShape>
>;
export type OnboardingLlmOutput = z.infer<typeof OnboardingLlmShape>;
