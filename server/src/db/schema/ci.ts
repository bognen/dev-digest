import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { agents } from './agents';
import { workspaces } from './core';
import { repos } from './repos';
import { agentRuns } from './runs';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    repoGithubId: bigint('repo_github_id', { mode: 'number' }).notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    slug: text('slug').notNull(),
    workflowPath: text('workflow_path').notNull(),
    workflowVersion: integer('workflow_version').notNull(),
    branch: text('branch').notNull(),
    prUrl: text('pr_url'),
    prNumber: integer('pr_number'),
    prState: text('pr_state', { enum: ['open', 'merged', 'closed'] }),
    status: text('status', { enum: ['active', 'removal_pending', 'removed'] })
      .notNull()
      .default('active'),
    removalBranch: text('removal_branch'),
    removalPrUrl: text('removal_pr_url'),
    removalPrNumber: integer('removal_pr_number'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    exportedCiFailOn: text('exported_ci_fail_on').notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    agentRepoUq: uniqueIndex('ci_installations_agent_repo_uq').on(t.agentId, t.repoId),
    // AC-84: a removed installation releases its slug.
    repoSlugActiveUq: uniqueIndex('ci_installations_repo_slug_active_uq')
      .on(t.repoId, t.slug)
      .where(sql`${t.status} <> 'removed'`),
    repoIdx: index('ci_installations_repo_idx').on(t.repoId),
    workspaceIdx: index('ci_installations_workspace_idx').on(t.workspaceId),
  }),
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'set null' }),
    repoFullName: text('repo_full_name').notNull(),
    repoGithubId: bigint('repo_github_id', { mode: 'number' }),
    workflowPath: text('workflow_path'),
    agentSlug: text('agent_slug'),
    workflowRunId: bigint('workflow_run_id', { mode: 'number' }).notNull(),
    runAttempt: integer('run_attempt').notNull(),
    headSha: text('head_sha'),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    agentName: text('agent_name'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    // Evolving set; kept as text (no DB CHECK) so new statuses need no migration.
    status: text('status', {
      enum: ['succeeded', 'no_findings', 'failed', 'skipped', 'result_expired', 'rejected'],
    }),
    reason: text('reason'),
    verdict: text('verdict'),
    critical: integer('critical'),
    warning: integer('warning'),
    suggestion: integer('suggestion'),
    blockers: integer('blockers'),
    durationMs: integer('duration_ms'),
    partial: boolean('partial').notNull().default(false),
    skippedFiles: jsonb('skipped_files'),
    version: text('version'),
    findingsCount: integer('findings_count'),
    costUsd: doublePrecision('cost_usd'),
    githubUrl: text('github_url'),
    source: text('source'),
  },
  (t) => ({
    runKeyUq: uniqueIndex('ci_runs_ws_run_attempt_uq').on(
      t.workspaceId,
      t.workflowRunId,
      t.runAttempt,
    ),
    wsRanAtIdx: index('ci_runs_ws_ran_at_idx').on(t.workspaceId, t.ranAt),
    agentIdx: index('ci_runs_agent_idx').on(t.agentId),
    installationIdx: index('ci_runs_installation_idx').on(t.ciInstallationId),
  }),
);
