import { createHash } from 'node:crypto';
import type { Intent, IntentConfidence, PrIntentRecord } from '@devdigest/shared';
import type { PromptIntent } from '@devdigest/reviewer-core';
import {
  INTENT_PROMPT_VERSION,
  MAX_BULLET_CHARS,
  MAX_BULLETS,
  MAX_COMMIT_SUBJECT_CHARS,
  MAX_COMMITS,
  MAX_HUNK_CONTEXT_CHARS,
  MAX_HUNK_CONTEXTS,
  MAX_STATEMENT_CHARS,
  MAX_TICKET_REFS,
  MIN_DESCRIPTION_CHARS,
  MIN_DESCRIPTION_WORDS,
} from '../constants.js';
import type { StoredIntent } from '../types.js';

/**
 * Pure helpers for the Intent Layer (ring 1/2 — no I/O, no fastify/drizzle/
 * adapters). All regexes are linear (no catastrophic backtracking) and are
 * always applied to pre-capped strings, per the ReDoS mitigation in the plan.
 */

// ---- isSubstantiveDescription -----------------------------------------------

const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const HEADING_LINE_RE = /^\s*#{1,6}\s.*$/gm;
const CHECKLIST_LINE_RE = /^\s*-\s*\[[ xX]\]\s*.*$/gm;

/**
 * True only when the PR body has real prose left after stripping PR-template
 * boilerplate (HTML comments, heading-only lines, checklist lines) — at least
 * `MIN_DESCRIPTION_CHARS` non-space chars AND `MIN_DESCRIPTION_WORDS` words.
 */
export function isSubstantiveDescription(body: string | null | undefined): boolean {
  if (!body) return false;
  const stripped = body
    .replace(HTML_COMMENT_RE, ' ')
    .replace(HEADING_LINE_RE, ' ')
    .replace(CHECKLIST_LINE_RE, ' ')
    .trim();
  const nonSpaceChars = stripped.replace(/\s+/g, '').length;
  const words = stripped.split(/\s+/).filter(Boolean).length;
  return nonSpaceChars >= MIN_DESCRIPTION_CHARS && words >= MIN_DESCRIPTION_WORDS;
}

// ---- extractIssueRef ---------------------------------------------------------

/** "Closes #12", "Fixes: #12", "resolved #12" — closing keywords win over a bare ref. */
const CLOSE_KEYWORD_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s*#(\d+)\b/i;
/**
 * A bare `#N` NOT preceded by another `#` (excludes `##heading`), a word
 * character (excludes `owner/repo#123` and `word#123` — same-repo only), or a
 * `/` (excludes URL fragments like `https://x/#3`).
 */
const BARE_REF_RE = /(?:^|[^#\w/])#(\d+)\b/;

/** Parse a same-repo linked-issue number from a PR body; `null` if none. */
export function extractIssueRef(body: string | null | undefined): number | null {
  if (!body) return null;
  const closing = body.match(CLOSE_KEYWORD_RE);
  if (closing?.[1]) return Number(closing[1]);
  const bare = body.match(BARE_REF_RE);
  return bare?.[1] ? Number(bare[1]) : null;
}

// ---- extractTicketRefs -------------------------------------------------------

/** Jira/Linear-style short codes, e.g. `ABC-123`, `ENG-42`. */
const TICKET_KEY_RE = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;
/** Notion / Google Docs / Linear URLs — recorded as text only, NEVER fetched. */
const TICKET_URL_RE = /\bhttps?:\/\/(?:www\.)?(?:notion\.so|docs\.google\.com|linear\.app)\/\S+/g;
/** Repo-relative spec-doc paths. */
const SPEC_PATH_RE = /\bdocs\/specs\/[\w./-]+\.md\b/g;

/** Extract external ticket/spec references as TEXT ONLY (never dereferenced). */
export function extractTicketRefs(texts: (string | null | undefined)[]): string[] {
  const joined = texts.filter((t): t is string => Boolean(t)).join('\n');
  const found = [
    ...joined.match(TICKET_KEY_RE) ?? [],
    ...joined.match(TICKET_URL_RE) ?? [],
    ...joined.match(SPEC_PATH_RE) ?? [],
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ref of found) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push(ref);
    if (out.length >= MAX_TICKET_REFS) break;
  }
  return out;
}

// ---- hunkContexts -------------------------------------------------------------

/** Text after the second `@@` in a unified-diff hunk header (the "changed symbols" hint). */
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@(.*)$/gm;

/** Extract non-empty hunk-header trailing context from raw diff/patch text. */
export function hunkContexts(
  diffText: string,
  cap = MAX_HUNK_CONTEXTS,
  maxChars = MAX_HUNK_CONTEXT_CHARS,
): string[] {
  const out: string[] = [];
  for (const m of diffText.matchAll(HUNK_HEADER_RE)) {
    const ctx = m[1]?.trim();
    if (!ctx) continue;
    out.push(ctx.slice(0, maxChars));
    if (out.length >= cap) break;
  }
  return out;
}

// ---- commitSubjects -----------------------------------------------------------

/** Cap already-fetched first-line commit subjects to the prompt budget. */
export function commitSubjects(
  subjects: string[],
  cap = MAX_COMMITS,
  maxChars = MAX_COMMIT_SUBJECT_CHARS,
): string[] {
  return subjects.slice(0, cap).map((s) => s.slice(0, maxChars));
}

// ---- deriveConfidence ---------------------------------------------------------

/**
 * Confidence is set DETERMINISTICALLY IN CODE from which inputs were actually
 * available — the model is never asked for a confidence value.
 */
export function deriveConfidence(input: {
  descriptionSubstantive: boolean;
  linkedIssueSubstantive: boolean;
}): IntentConfidence {
  return input.descriptionSubstantive || input.linkedIssueSubstantive ? 'high' : 'low';
}

// ---- intentInputHash ----------------------------------------------------------

function normalizeForHash(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/**
 * Cache key: changes when title, body (beyond whitespace), branch, head_sha,
 * the linked-issue number, or the prompt version changes.
 */
export function intentInputHash(input: {
  title: string;
  body: string;
  branch: string;
  headSha: string;
  linkedIssueNumber: number | null;
}): string {
  const parts = [
    INTENT_PROMPT_VERSION,
    normalizeForHash(input.title),
    normalizeForHash(input.body),
    input.linkedIssueNumber,
    normalizeForHash(input.branch),
    input.headSha,
  ];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

// ---- sanitizeIntent -------------------------------------------------------------

function sanitizeBullets(bullets: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of bullets) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const capped = trimmed.slice(0, MAX_BULLET_CHARS);
    const key = capped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(capped);
    if (out.length >= MAX_BULLETS) break;
  }
  return out;
}

/**
 * Sanitize the model's structured Intent output: trim, drop empties, dedupe,
 * cap lengths/counts. An empty statement (after trim) is treated as
 * `schema_invalid` by the caller — this function THROWS in that case so
 * `IntentService.ensure()` maps it to `generation_failed`.
 */
export function sanitizeIntent(raw: Intent): Intent {
  const statement = raw.intent.trim().slice(0, MAX_STATEMENT_CHARS);
  if (!statement) throw new Error('intent: empty statement (schema_invalid)');
  return {
    intent: statement,
    in_scope: sanitizeBullets(raw.in_scope),
    out_of_scope: sanitizeBullets(raw.out_of_scope),
  };
}

// ---- toPromptIntent -------------------------------------------------------------

/** Map a persisted intent row to reviewer-core's engine-local `PromptIntent` shape. */
export function toPromptIntent(stored: StoredIntent): PromptIntent {
  return {
    statement: stored.intent,
    inScope: stored.inScope,
    outOfScope: stored.outOfScope,
    confidence: stored.confidence,
  };
}

/** Map a persisted intent row to the wire `PrIntentRecord` shape; `stale` is
 *  always computed by the caller (never persisted). Shared by `intent.ts`'s
 *  `get()` and `service.ts`'s `generateIntent()` fallback-to-previous path. */
export function toIntentRecord(stored: StoredIntent, stale: boolean): PrIntentRecord {
  return {
    intent: stored.intent,
    in_scope: stored.inScope,
    out_of_scope: stored.outOfScope,
    pr_id: stored.prId,
    confidence: stored.confidence,
    sources: stored.sources,
    ticket_refs: stored.ticketRefs,
    linked_issue: stored.linkedIssue,
    provider: stored.provider,
    model: stored.model,
    head_sha: stored.headSha,
    generated_at: stored.generatedAt.toISOString(),
    stale,
  };
}
