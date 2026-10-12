import { z } from 'zod';

/**
 * Onboarding Tour (SPEC-02): deterministic repo facts + one grounded LLM call.
 * Every section carries a state so a missing section is explicit ("not
 * available" with a reason), never silently empty. Strings/arrays are bounded.
 */

export const OnboardingSectionState = z.enum(['ok', 'not_available', 'requires_generation']);
export type OnboardingSectionState = z.infer<typeof OnboardingSectionState>;

export const TourSkeletonReason = z.enum([
  'index_degraded',
  'index_failed',
  'index_not_built',
  'llm_unavailable',
  'invalid_output',
]);
export type TourSkeletonReason = z.infer<typeof TourSkeletonReason>;

export const RunStepKind = z.enum(['install', 'configure', 'services', 'run', 'other']);
export type RunStepKind = z.infer<typeof RunStepKind>;

const Reason = z.string().max(500).nullable();

export const TourArchitecture = z.object({
  state: OnboardingSectionState,
  reason: Reason,
  stack: z.array(z.object({ name: z.string().max(100), evidence: z.string().max(300) })).max(50),
  structure: z.array(z.object({ path: z.string().max(500), files: z.number().int().min(0) })).max(200),
  routes: z.array(z.string().max(300)).max(100),
  summary_markdown: z.string().max(8000).nullable(),
  diagram: z.string().max(8000).nullable(),
});
export type TourArchitecture = z.infer<typeof TourArchitecture>;

export const TourCriticalPaths = z.object({
  state: OnboardingSectionState,
  reason: Reason,
  items: z
    .array(
      z.object({
        path: z.string().max(500),
        importers: z.number().int().min(0),
        role: z.string().max(500),
        role_source: z.enum(['llm', 'deterministic']),
      }),
    )
    .max(5),
});
export type TourCriticalPaths = z.infer<typeof TourCriticalPaths>;

export const TourRunLocally = z.object({
  state: OnboardingSectionState,
  reason: Reason,
  steps: z
    .array(
      z.object({
        kind: RunStepKind,
        command: z.string().max(500),
        source: z.string().max(300),
      }),
    )
    .max(30),
});
export type TourRunLocally = z.infer<typeof TourRunLocally>;

export const TourReadingPath = z.object({
  state: OnboardingSectionState,
  reason: Reason,
  items: z
    .array(
      z.object({
        position: z.number().int().min(1),
        path: z.string().max(500),
        reason: z.string().max(500),
        score: z.number(),
      }),
    )
    .max(10),
  hotness: z.object({
    applied: z.boolean(),
    window_days: z.number().int().min(0),
    note: z.string().max(500).nullable(),
  }),
});
export type TourReadingPath = z.infer<typeof TourReadingPath>;

export const TourFirstTasks = z.object({
  state: OnboardingSectionState,
  reason: Reason,
  items: z
    .array(
      z.object({
        title: z.string().max(200),
        rationale: z.string().max(1000),
        files: z.array(z.string().max(500)).max(10),
      }),
    )
    .max(5),
});
export type TourFirstTasks = z.infer<typeof TourFirstTasks>;

export const OnboardingTour = z.object({
  architecture: TourArchitecture,
  critical_paths: TourCriticalPaths,
  run_locally: TourRunLocally,
  reading_path: TourReadingPath,
  first_tasks: TourFirstTasks,
  basis: z.object({
    files_indexed: z.number().int().min(0),
    files_considered: z.number().int().min(0),
  }),
  /** AC-35 allowlist: index paths that LLM Markdown may link to. */
  link_paths: z.array(z.string().max(500)).max(2000),
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingTourProvenance = z.object({
  status: z.enum(['generated', 'skeleton']),
  skeleton_reason: TourSkeletonReason.nullable(),
  skeleton_detail: z.string().max(500).nullable(),
  generated_at: z.string(),
  indexed_sha: z.string(),
  index_status: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  files_indexed: z.number().int().min(0),
  files_considered: z.number().int().min(0),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type OnboardingTourProvenance = z.infer<typeof OnboardingTourProvenance>;

/** GET / POST response for the per-repo tour. */
export const OnboardingTourState = z.object({
  status: z.enum(['none', 'generating', 'generated', 'skeleton']),
  repo: z.object({ id: z.string(), full_name: z.string() }),
  tour: OnboardingTour.nullable(),
  provenance: OnboardingTourProvenance.nullable(),
  current_index_sha: z.string().nullable(),
  last_failure: z.object({ reason: z.string().max(500), at: z.string() }).nullable(),
});
export type OnboardingTourState = z.infer<typeof OnboardingTourState>;
