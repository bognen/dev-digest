import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, index, check } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id'),
    /** The agent_run that produced this review (links the timeline run ↔ review). */
    runId: uuid('run_id'),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => ({
    // Serves the pulls-list rollup: `WHERE pr_id IN (...) AND kind = 'review'`.
    prKindIdx: index('reviews_pr_kind_idx').on(t.prId, t.kind),
    agentIdx: index('reviews_agent_idx').on(t.agentId),
  }),
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind').notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    // Serves the pulls-list rollup's `INNER JOIN findings ON findings.review_id = reviews.id`.
    reviewIdx: index('findings_review_idx').on(t.reviewId),
  }),
);

export const prIntent = pgTable(
  'pr_intent',
  {
    prId: uuid('pr_id')
      .primaryKey()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    intent: text('intent').notNull(),
    inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Set deterministically in code from which inputs were available — never
     *  model-reported. See `deriveConfidence` in reviews/pipeline/intent-signals.ts. */
    confidence: text('confidence').notNull().default('low'),
    /** Which signal kinds were actually sent to the intent model (drives the UI's "why" line). */
    sources: jsonb('sources').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** External ticket/spec refs extracted as TEXT ONLY (never fetched). Not a reserved word
     *  substitute for "references", which IS a reserved word in Postgres. */
    ticketRefs: jsonb('ticket_refs').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    linkedIssue: integer('linked_issue'),
    /** NULL for legacy rows generated before this column existed. */
    provider: text('provider'),
    model: text('model'),
    /** Cache key input; NULL means "always stale" (forces regeneration). */
    inputHash: text('input_hash'),
    /** The PR's head_sha at generation time — staleness is `stale = headSha !== pull.headSha`. */
    headSha: text('head_sha'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    confidenceCheck: check('pr_intent_confidence_check', sql`${t.confidence} IN ('high', 'low')`),
  }),
);

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
