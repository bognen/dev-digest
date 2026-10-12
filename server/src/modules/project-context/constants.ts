import type { ProjectDocRoot } from '@devdigest/shared';

/** Top-level folders of a checkout scanned for project-context documents. */
export const PROJECT_DOC_ROOTS: readonly ProjectDocRoot[] = ['specs', 'docs', 'insights'];

/** Per-document size limit (matches brief's MAX_SPEC_BYTES). */
export const MAX_DOC_BYTES = 256 * 1024;

/** Safety cap on the number of documents discovered in one checkout. */
export const MAX_DISCOVERED_DOCS = 2000;

/** Directory names never descended into, even inside a root. */
export const IGNORED_DIRS: readonly string[] = ['node_modules', '.git'];

/** Token budget for the injected block (OQ-1). */
export const BUDGET_FALLBACK_TOKENS = 16_000;
export const BUDGET_CONTEXT_RATIO = 0.2;
export const BUDGET_MIN_TOKENS = 4_000;
export const BUDGET_MAX_TOKENS = 32_000;

/** Max documents attached to one agent/skill (mirrors the PUT body limit). */
export const MAX_ATTACHMENTS = 100;
