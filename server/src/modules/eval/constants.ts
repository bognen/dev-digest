import { EVAL_LIMITS } from '@devdigest/shared';

/** SPEC-06 limits — single source is the shared contract (client editor uses it too). */
export const MAX_DIFF_BYTES = EVAL_LIMITS.maxDiffBytes;
export const MAX_FILE_BYTES = EVAL_LIMITS.maxFileBytes;
export const MAX_FILES = EVAL_LIMITS.maxFiles;
export const MAX_EXPECTATIONS = EVAL_LIMITS.maxExpectations;
/** AC-4: a finding's file diff longer than this keeps only overlapping hunks. */
export const SNIPPET_MAX_DIFF_LINES = EVAL_LIMITS.snippetMaxDiffLines;

/** AC-7: generated case names are capped at this many characters. */
export const CASE_NAME_MAX = 60;

/** A `running` suite run older than this is treated as interrupted (server restart). */
export const STALE_RUN_MS = 30 * 60 * 1000;

/** Eval reviews are pinned to temperature 0 so runs stay comparable (AC-65). */
export const EVAL_TEMPERATURE = 0;

/** Dashboard sizes (AC-37, AC-38). */
export const RECENT_RUNS_LIMIT = 20;
export const SPARK_POINTS = 10;
export const HISTORY_LIMIT = 200;
/** Default trend/history period in days (AC-39); 0 = all time. */
export const DEFAULT_PERIOD_DAYS = 30;

/** AC-41: a drop of at least this much (fraction) raises the regression banner. */
export const ALERT_MIN_DROP = 0.01;
