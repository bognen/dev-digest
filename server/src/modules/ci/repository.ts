import { and, asc, desc, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import { CiFailOn } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { CI_RUNS_LIST_LIMIT } from './constants.js';
import { buildRunUrl } from './helpers.js';
import type {
  CiInstallationRecord,
  CiLatestRun,
  CiMemoryRow,
  CiPrState,
  CiRepoRecord,
  CiRunRecord,
  CiStore,
  InsertAcceptedRun,
  InsertNonAcceptedRun,
  RemovalPrFields,
  UpsertInstallation,
} from './types.js';

type InstallationRow = typeof t.ciInstallations.$inferSelect;
type RunRow = typeof t.ciRuns.$inferSelect;

const ACCEPTED_STATUSES = ['succeeded', 'no_findings'] as const;

function toInstallation(row: InstallationRow): CiInstallationRecord {
  const failOn = CiFailOn.safeParse(row.exportedCiFailOn);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    repoId: row.repoId,
    repo: row.repo,
    repoGithubId: row.repoGithubId,
    targetType: row.targetType,
    slug: row.slug,
    workflowPath: row.workflowPath,
    workflowVersion: row.workflowVersion,
    branch: row.branch,
    prUrl: row.prUrl,
    prNumber: row.prNumber,
    prState: row.prState,
    status: row.status,
    removalBranch: row.removalBranch,
    removalPrUrl: row.removalPrUrl,
    removalPrNumber: row.removalPrNumber,
    removedAt: row.removedAt,
    exportedCiFailOn: failOn.success ? failOn.data : 'critical',
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
}

function stringArray(json: unknown): string[] {
  return Array.isArray(json) ? json.filter((v): v is string => typeof v === 'string') : [];
}

function toRun(row: RunRow, installationStatus: InstallationRow['status'] | null): CiRunRecord {
  // Only the canonical Actions URL is ever surfaced; anything else is dropped.
  const expected = buildRunUrl(row.repoFullName, row.workflowRunId);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ciInstallationId: row.ciInstallationId,
    installationStatus,
    repoId: row.repoId,
    repoFullName: row.repoFullName,
    repoGithubId: row.repoGithubId,
    workflowPath: row.workflowPath,
    agentSlug: row.agentSlug,
    workflowRunId: row.workflowRunId,
    runAttempt: row.runAttempt,
    headSha: row.headSha,
    agentId: row.agentId,
    agentName: row.agentName,
    prNumber: row.prNumber,
    ranAt: row.ranAt,
    status: row.status,
    reason: row.reason,
    verdict: row.verdict,
    critical: row.critical,
    warning: row.warning,
    suggestion: row.suggestion,
    blockers: row.blockers,
    durationMs: row.durationMs,
    partial: row.partial,
    skippedFiles: stringArray(row.skippedFiles),
    version: row.version,
    findingsCount: row.findingsCount,
    costUsd: row.costUsd,
    runUrl: row.githubUrl === expected ? row.githubUrl : null,
  };
}

/**
 * CI data-access. Owns `ci_installations` and `ci_runs`; reads `repos` / `memory`
 * and inserts `agent_runs` rows (source='ci', pr_id NULL) for accepted runs.
 * Workspace-scoped throughout.
 */
export class CiRepository implements CiStore {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<CiRepoRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    if (!row) return undefined;
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      owner: row.owner,
      name: row.name,
      fullName: row.fullName,
      defaultBranch: row.defaultBranch,
    };
  }

  /** global + team rows, plus repo-scoped rows of the target repo (A5). */
  async listMemoryForExport(workspaceId: string, repoId: string): Promise<CiMemoryRow[]> {
    const rows = await this.db
      .select({ kind: t.memory.kind, scope: t.memory.scope, content: t.memory.content })
      .from(t.memory)
      .where(
        and(
          eq(t.memory.workspaceId, workspaceId),
          or(
            inArray(t.memory.scope, ['global', 'team']),
            and(eq(t.memory.scope, 'repo'), eq(t.memory.repoId, repoId)),
          ),
        ),
      )
      .orderBy(asc(t.memory.createdAt), asc(t.memory.id));
    return rows;
  }

  // ---------------------------------------------------------------- installations

  async findInstallation(
    agentId: string,
    repoId: string,
  ): Promise<CiInstallationRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.agentId, agentId), eq(t.ciInstallations.repoId, repoId)));
    return row ? toInstallation(row) : undefined;
  }

  async getInstallation(
    workspaceId: string,
    id: string,
  ): Promise<CiInstallationRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.id, id)));
    return row ? toInstallation(row) : undefined;
  }

  async listRepoSlugsInUse(repoId: string, excludeAgentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ slug: t.ciInstallations.slug })
      .from(t.ciInstallations)
      .where(
        and(
          eq(t.ciInstallations.repoId, repoId),
          ne(t.ciInstallations.status, 'removed'),
          ne(t.ciInstallations.agentId, excludeAgentId),
        ),
      );
    return rows.map((r) => r.slug);
  }

  /**
   * Insert or update by `(agent_id, repo_id)`; always ends `active` (a re-add after
   * removal reuses the row, EC-53). The slug of an existing non-removed row is kept.
   */
  async upsertInstallation(input: UpsertInstallation): Promise<CiInstallationRecord> {
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        repoId: input.repoId,
        repo: input.repo,
        repoGithubId: input.repoGithubId,
        targetType: 'gha',
        slug: input.slug,
        workflowPath: input.workflowPath,
        workflowVersion: input.workflowVersion,
        branch: input.branch,
        prUrl: input.prUrl,
        prNumber: input.prNumber,
        prState: input.prState,
        status: 'active',
        exportedCiFailOn: input.exportedCiFailOn,
      })
      .onConflictDoUpdate({
        target: [t.ciInstallations.agentId, t.ciInstallations.repoId],
        set: {
          repo: input.repo,
          repoGithubId: input.repoGithubId,
          slug: sql`CASE WHEN ${t.ciInstallations.status} = 'removed' THEN excluded.slug ELSE ${t.ciInstallations.slug} END`,
          workflowPath: sql`CASE WHEN ${t.ciInstallations.status} = 'removed' THEN excluded.workflow_path ELSE ${t.ciInstallations.workflowPath} END`,
          workflowVersion: input.workflowVersion,
          branch: input.branch,
          prUrl: input.prUrl,
          prNumber: input.prNumber,
          prState: input.prState,
          status: 'active',
          removalBranch: null,
          removalPrUrl: null,
          removalPrNumber: null,
          removedAt: null,
          exportedCiFailOn: input.exportedCiFailOn,
          updatedAt: new Date(),
        },
      })
      .returning();
    return toInstallation(row!);
  }

  async setRemovalPending(id: string, fields: RemovalPrFields): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({
        status: 'removal_pending',
        removalBranch: fields.branch,
        removalPrUrl: fields.prUrl,
        removalPrNumber: fields.prNumber,
        updatedAt: new Date(),
      })
      .where(eq(t.ciInstallations.id, id));
  }

  async markRemoved(id: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(t.ciInstallations)
      .set({ status: 'removed', removedAt: now, updatedAt: now })
      .where(eq(t.ciInstallations.id, id));
  }

  async reactivate(id: string): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({
        status: 'active',
        removalBranch: null,
        removalPrUrl: null,
        removalPrNumber: null,
        updatedAt: new Date(),
      })
      .where(eq(t.ciInstallations.id, id));
  }

  async updatePrState(id: string, prState: CiPrState): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({ prState, updatedAt: new Date() })
      .where(eq(t.ciInstallations.id, id));
  }

  async listInstallationsForAgent(
    workspaceId: string,
    agentId: string,
  ): Promise<CiInstallationRecord[]> {
    const rows = await this.db
      .select()
      .from(t.ciInstallations)
      .where(
        and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)),
      )
      .orderBy(asc(t.ciInstallations.installedAt));
    return rows.map(toInstallation);
  }

  async listPollableInstallations(workspaceId: string): Promise<CiInstallationRecord[]> {
    const rows = await this.db
      .select()
      .from(t.ciInstallations)
      .where(
        and(
          eq(t.ciInstallations.workspaceId, workspaceId),
          inArray(t.ciInstallations.status, ['active', 'removal_pending']),
        ),
      )
      .orderBy(asc(t.ciInstallations.installedAt));
    return rows.map(toInstallation);
  }

  // ------------------------------------------------------------------------ runs

  async existingRunKeys(workspaceId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ id: t.ciRuns.workflowRunId, attempt: t.ciRuns.runAttempt })
      .from(t.ciRuns)
      .where(eq(t.ciRuns.workspaceId, workspaceId));
    return new Set(rows.map((r) => `${r.id}:${r.attempt}`));
  }

  /**
   * One transaction: insert the `ci_runs` row (conflict on the run key = already
   * ingested → nothing else written), then its `agent_runs` row (source='ci',
   * pr_id NULL — so the PR feed never sees it), then link them.
   */
  async insertAcceptedRun(input: InsertAcceptedRun): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(t.ciRuns)
        .values({
          ...this.commonRunValues(input),
          status: input.status,
          verdict: input.verdict,
          critical: input.critical,
          warning: input.warning,
          suggestion: input.suggestion,
          blockers: input.blockers,
          findingsCount: input.findingsCount,
          costUsd: input.costUsd,
          durationMs: input.durationMs,
          partial: input.partial,
          skippedFiles: input.skippedFiles,
          version: input.version,
        })
        .onConflictDoNothing({
          target: [t.ciRuns.workspaceId, t.ciRuns.workflowRunId, t.ciRuns.runAttempt],
        })
        .returning({ id: t.ciRuns.id });
      if (!inserted) return false;

      const [agentRun] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          prId: null,
          ranAt: input.ranAt,
          provider: input.provider,
          model: input.model,
          durationMs: input.durationMs,
          status: 'done',
          source: 'ci',
          findingsCount: input.findingsCount,
          blockers: input.blockers,
          costUsd: input.costUsd,
        })
        .returning({ id: t.agentRuns.id });
      await tx
        .update(t.ciRuns)
        .set({ agentRunId: agentRun!.id })
        .where(eq(t.ciRuns.id, inserted.id));
      return true;
    });
  }

  /** failed / skipped / result_expired / rejected: no agent_runs row, no findings or cost. */
  async insertNonAcceptedRun(input: InsertNonAcceptedRun): Promise<boolean> {
    const rows = await this.db
      .insert(t.ciRuns)
      .values({ ...this.commonRunValues(input), status: input.status, reason: input.reason })
      .onConflictDoNothing({
        target: [t.ciRuns.workspaceId, t.ciRuns.workflowRunId, t.ciRuns.runAttempt],
      })
      .returning({ id: t.ciRuns.id });
    return rows.length > 0;
  }

  async listRuns(
    workspaceId: string,
    opts: { agentId?: string; limit?: number } = {},
  ): Promise<CiRunRecord[]> {
    const where = opts.agentId
      ? and(eq(t.ciRuns.workspaceId, workspaceId), eq(t.ciRuns.agentId, opts.agentId))
      : eq(t.ciRuns.workspaceId, workspaceId);
    const rows = await this.db
      .select({ run: t.ciRuns, installationStatus: t.ciInstallations.status })
      .from(t.ciRuns)
      .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .where(where)
      .orderBy(desc(t.ciRuns.ranAt), desc(t.ciRuns.workflowRunId))
      .limit(opts.limit ?? CI_RUNS_LIST_LIMIT);
    return rows.map((r) => toRun(r.run, r.installationStatus));
  }

  async acceptedRunCountsByInstallation(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ id: t.ciRuns.ciInstallationId, n: sql<number>`count(*)::int` })
      .from(t.ciRuns)
      .where(
        and(
          eq(t.ciRuns.workspaceId, workspaceId),
          isNotNull(t.ciRuns.ciInstallationId),
          inArray(t.ciRuns.status, [...ACCEPTED_STATUSES]),
        ),
      )
      .groupBy(t.ciRuns.ciInstallationId);
    return new Map(rows.flatMap((r) => (r.id ? [[r.id, r.n] as [string, number]] : [])));
  }

  async latestRunPerInstallation(workspaceId: string): Promise<Map<string, CiLatestRun>> {
    const rows = await this.db
      .select({
        id: t.ciRuns.ciInstallationId,
        status: t.ciRuns.status,
        ranAt: t.ciRuns.ranAt,
      })
      .from(t.ciRuns)
      .where(
        and(
          eq(t.ciRuns.workspaceId, workspaceId),
          isNotNull(t.ciRuns.ciInstallationId),
          isNotNull(t.ciRuns.ranAt),
          isNotNull(t.ciRuns.status),
        ),
      )
      .orderBy(desc(t.ciRuns.ranAt));
    const out = new Map<string, CiLatestRun>();
    for (const r of rows) {
      if (r.id && r.status && r.ranAt && !out.has(r.id)) {
        out.set(r.id, { installationId: r.id, status: r.status, ranAt: r.ranAt });
      }
    }
    return out;
  }

  private commonRunValues(input: InsertNonAcceptedRun | InsertAcceptedRun) {
    return {
      workspaceId: input.workspaceId,
      ciInstallationId: input.installationId,
      repoId: input.repoId,
      repoFullName: input.repoFullName,
      repoGithubId: input.repoGithubId,
      workflowPath: input.workflowPath,
      agentSlug: input.agentSlug,
      workflowRunId: input.workflowRunId,
      runAttempt: input.runAttempt,
      headSha: input.headSha,
      agentId: input.agentId,
      agentName: input.agentName,
      prNumber: input.prNumber,
      ranAt: input.ranAt,
      githubUrl: buildRunUrl(input.repoFullName, input.workflowRunId),
      source: 'ci',
    };
  }
}
