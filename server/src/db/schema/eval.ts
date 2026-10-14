import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    /** EvalCaseFile[] — full files given to the model as read-only context. */
    inputFiles: jsonb('input_files'),
    /** EvalCaseMeta — PR title/body + provenance of a finding-derived case. */
    inputMeta: jsonb('input_meta'),
    /** EvalExpectedOutput — `{ expectations: EvalExpectation[] }`. */
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    /** The finding this case was created from (one case per owner + finding). */
    sourceFindingId: uuid('source_finding_id'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index('eval_cases_owner_idx').on(t.ownerKind, t.ownerId),
    sourceUq: uniqueIndex('eval_cases_owner_source_finding_uq')
      .on(t.ownerKind, t.ownerId, t.sourceFindingId)
      .where(sql`${t.sourceFindingId} IS NOT NULL`),
  }),
);

/**
 * One execution of an owner's case set (scope 'full') or of a single case
 * (scope 'case'). Holds the agent config snapshot the run used, so runs of
 * different agent versions can be compared and promoted.
 */
export const evalSuiteRuns = pgTable(
  'eval_suite_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    hostAgentId: uuid('host_agent_id').notNull(),
    scope: text('scope', { enum: ['full', 'case'] }).notNull().default('full'),
    status: text('status', { enum: ['running', 'done', 'partial', 'failed'] })
      .notNull()
      .default('running'),
    agentVersion: integer('agent_version').notNull(),
    /** EvalConfigSnapshot. */
    configSnapshot: jsonb('config_snapshot').notNull(),
    caseIds: jsonb('case_ids').$type<string[]>().notNull(),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    /** EvalVacuous. */
    vacuous: jsonb('vacuous'),
    tracesPassed: integer('traces_passed').notNull().default(0),
    tracesTotal: integer('traces_total').notNull().default(0),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    ownerStartedIdx: index('eval_suite_runs_owner_started_idx').on(t.ownerKind, t.ownerId, t.startedAt),
    workspaceStartedIdx: index('eval_suite_runs_workspace_started_idx').on(t.workspaceId, t.startedAt),
  }),
);

/** Per-case result of a suite run. Snapshots keep history after a case is deleted. */
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    suiteRunId: uuid('suite_run_id').references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id').references(() => evalCases.id, { onDelete: 'set null' }),
    caseName: text('case_name'),
    status: text('status', { enum: ['pass', 'fail', 'error'] }),
    /** EvalExpectedOutput as it was when the case ran. */
    expectedSnapshot: jsonb('expected_snapshot'),
    error: text('error'),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    /** `{ kept, dropped, matched, unmatched }`. */
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => ({
    suiteIdx: index('eval_runs_suite_idx').on(t.suiteRunId),
    caseIdx: index('eval_runs_case_idx').on(t.caseId, t.ranAt),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
