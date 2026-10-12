/**
 * onboarding-tour constants (SPEC-02). Pure — no I/O — so arch-check's INNER
 * regex covers it.
 */

export const ONBOARDING_FEATURE = 'onboarding' as const;

// --- Prompt budget (OQ-1) ---------------------------------------------------
export const TOUR_TOP_FILES = 30;
export const EXCERPT_MAX_BYTES = 2048;
export const INPUT_TOKEN_CAP = 24_000;

// --- Output bounds ----------------------------------------------------------
export const MAX_CRITICAL_PATHS = 5;
export const MAX_READING_PATH = 10;
export const FIRST_TASKS_MIN = 3;
export const FIRST_TASKS_MAX = 5;
export const MAX_RUN_STEPS = 30;
export const MAX_STACK = 50;
export const MAX_STRUCTURE = 200;
export const MAX_ROUTES = 100;

/** Hotness window, anchored at the indexed commit's committer date (C9). */
export const HOTNESS_WINDOW_DAYS = 90;

// --- The one LLM call (NFR-1) -----------------------------------------------
/**
 * Output budget: five sections (summary up to 4000 chars, a diagram, up to 20
 * commands, up to 10 tasks) plus headroom for reasoning models, whose hidden
 * reasoning tokens count against the same limit. 3000 truncated the JSON.
 */
export const LLM_MAX_OUTPUT_TOKENS = 8000;
/**
 * Sized for the larger budget on a slow/reasoning model. NFR-2 (whole
 * generation <= 60 s p95 with a provider answering within 30 s) describes the
 * normal case; this timeout only bounds the tail, so a slow answer is not cut
 * off into a skeleton.
 */
export const LLM_TIMEOUT_MS = 90_000;
export const LLM_TEMPERATURE = 0.2;

export const MAX_DIAGRAM_CHARS = 4000;
export const MAX_ERROR_DETAIL_CHARS = 300;

/**
 * AC-10 / C7: files that never belong in the Critical paths / Reading path
 * lists. Matched against `'/' + lowercased POSIX path`, so a leading directory
 * segment matches the same as a nested one.
 */
export const EXCLUDED_PATH_PATTERNS: readonly RegExp[] = [
  // tests
  /\.test\./,
  /\.spec\./,
  /\/__tests__\//,
  /\/tests?\//,
  /\/e2e\//,
  // configs
  /\.config\./,
  /\/\.?[a-z]*rc(\.[a-z]+)?$/,
  /\/(vitest|jest)\./,
  /eslint/,
  /prettier/,
  /tsconfig/,
  // declarations
  /\.d\.ts$/,
  // migrations
  /\/migrations?\//,
  /\/migrate\//,
  // generated / build output
  /\/generated\//,
  /\/__generated__\//,
  /\.generated\./,
  /\.gen\./,
  /\.min\.js$/,
  /\/dist\//,
  /\/build\//,
];

/** Display order of run-step kinds (AC-22). */
export const RUN_KIND_ORDER = ['install', 'configure', 'services', 'run', 'other'] as const;
