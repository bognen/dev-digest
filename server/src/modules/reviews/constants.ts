/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

// ============================================================ Intent Layer

/** Settings -> Feature Models id for the intent-derivation call. */
export const INTENT_FEATURE = 'review_intent' as const;

/**
 * Bumping this changes `intentInputHash`'s output for every PR, forcing a
 * regeneration on next `ensure()` — bump it whenever the system prompt or the
 * signal set sent to the model changes shape.
 */
export const INTENT_PROMPT_VERSION = 1;

/** Deadline for the whole derive-intent step (issue fetch + LLM call combined). */
export const INTENT_TIMEOUT_MS = 20_000;

// ---- Input caps (Design §1) — every signal is capped BEFORE it reaches the model.
export const MAX_TITLE_CHARS = 300;
/** Matches reviewer-core's MAX_PR_DESCRIPTION_CHARS so a description isn't
 *  truncated differently by the intent call vs the review prompt. */
export const MAX_DESCRIPTION_CHARS = 4000;
export const MAX_ISSUE_TITLE_CHARS = 300;
export const MAX_ISSUE_BODY_CHARS = 2000;
export const MAX_BRANCH_CHARS = 200;
export const MAX_COMMITS = 20;
export const MAX_COMMIT_SUBJECT_CHARS = 120;
export const MAX_FILE_PATHS = 60;
export const MAX_HUNK_CONTEXTS = 30;
export const MAX_HUNK_CONTEXT_CHARS = 100;
export const MAX_TICKET_REFS = 5;

// ---- Substantive-description thresholds (isSubstantiveDescription) --------
export const MIN_DESCRIPTION_CHARS = 60;
export const MIN_DESCRIPTION_WORDS = 10;

// ---- Output sanitization caps (sanitizeIntent) -----------------------------
export const MAX_STATEMENT_CHARS = 240;
export const MAX_BULLET_CHARS = 120;
export const MAX_BULLETS = 6;

// ---- LLM call shape — cheap, deterministic, single retry -------------------
export const INTENT_TEMPERATURE = 0;
export const INTENT_MAX_RETRIES = 1;
export const INTENT_MAX_TOKENS = 700;
