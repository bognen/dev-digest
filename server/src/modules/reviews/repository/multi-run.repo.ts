import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { FindingRow } from '../../../db/rows.js';
import type { ChildRunStatus } from '@devdigest/shared';
import type {
  EstimateRunRow,
  LatestMultiRunRecord,
  MultiRunListRecord,
  MultiRunChildInsert,
  MultiRunChildRecord,
  MultiRunRecord,
} from '../types.js';

/** A review persisted by one child run, with its findings (domain shape). */
export interface MultiRunReviewRecord {
  runId: string;
  verdict: string | null;
  summary: string | null;
  score: number | null;
  findings: FindingRow[];
}

/** Estimate window: most recent `done` runs per agent. */
const ESTIMATE_HISTORY = 10;

const asChildStatus = (s: string | null): ChildRunStatus =>
  s === 'queued' || s === 'running' || s === 'done' || s === 'cancelled' ? s : 'failed';

/**
 * Create the multi-run header and ALL child `agent_runs` rows atomically, so a
 * partial failure never leaves a header without children. Children keep the
 * selection order in `multi_agent_position`.
 */
export async function createMultiRunWithChildren(
  db: Db,
  workspaceId: string,
  prId: string,
  children: MultiRunChildInsert[],
): Promise<{ multiRunId: string; runIds: string[] }> {
  return db.transaction(async (tx) => {
    const [parent] = await tx
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId })
      .returning({ id: t.multiAgentRuns.id });
    const multiRunId = parent!.id;
    const rows = await tx
      .insert(t.agentRuns)
      .values(
        children.map((c) => ({
          workspaceId,
          agentId: c.agentId,
          prId,
          provider: c.provider,
          model: c.model,
          status: c.status,
          source: 'local' as const,
          multiAgentRunId: multiRunId,
          multiAgentPosition: c.position,
        })),
      )
      .returning({ id: t.agentRuns.id, position: t.agentRuns.multiAgentPosition });
    rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return { multiRunId, runIds: rows.map((r) => r.id) };
  });
}

/** queued -> running when the run's turn comes. False when it was cancelled meanwhile. */
export async function claimAgentRun(db: Db, runId: string): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'running' })
    .where(and(eq(t.agentRuns.id, runId), inArray(t.agentRuns.status, ['queued', 'running'])))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** Workspace-scoped header read, joined with the PR's number + title. */
export async function getMultiRun(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<MultiRunRecord | undefined> {
  const [row] = await db
    .select({
      id: t.multiAgentRuns.id,
      prId: t.multiAgentRuns.prId,
      ranAt: t.multiAgentRuns.ranAt,
      prNumber: t.pullRequests.number,
      prTitle: t.pullRequests.title,
    })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(and(eq(t.multiAgentRuns.id, id), eq(t.multiAgentRuns.workspaceId, workspaceId)));
  return row;
}

/** Children in selection order, with the agent name (null if the agent is gone). */
export async function multiRunChildren(db: Db, multiRunId: string): Promise<MultiRunChildRecord[]> {
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(eq(t.agentRuns.multiAgentRunId, multiRunId))
    .orderBy(asc(t.agentRuns.multiAgentPosition));
  return rows.map(toChildRecord);
}

/**
 * One repo's multi-runs, newest first (workspace-scoped), each with its
 * children and total finding count. Three queries regardless of `limit`.
 */
export async function listMultiRuns(
  db: Db,
  workspaceId: string,
  repoId: string,
  limit: number,
): Promise<MultiRunListRecord[]> {
  const headers = await db
    .select({
      id: t.multiAgentRuns.id,
      prId: t.multiAgentRuns.prId,
      ranAt: t.multiAgentRuns.ranAt,
      prNumber: t.pullRequests.number,
      prTitle: t.pullRequests.title,
    })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.pullRequests.repoId, repoId)))
    .orderBy(desc(t.multiAgentRuns.ranAt))
    .limit(limit);
  if (headers.length === 0) return [];
  const ids = headers.map((h) => h.id);
  const kids = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(inArray(t.agentRuns.multiAgentRunId, ids))
    .orderBy(asc(t.agentRuns.multiAgentPosition));
  const counts = await db
    .select({
      multiRunId: t.agentRuns.multiAgentRunId,
      n: sql<number>`count(${t.findings.id})::int`,
    })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
    .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
    .where(inArray(t.agentRuns.multiAgentRunId, ids))
    .groupBy(t.agentRuns.multiAgentRunId);
  const countBy = new Map(counts.map((c) => [c.multiRunId, Number(c.n)]));
  return headers.map((h) => ({
    ...h,
    children: kids.filter((k) => k.run.multiAgentRunId === h.id).map(toChildRecord),
    findingCount: countBy.get(h.id) ?? 0,
  }));
}

function toChildRecord({
  run,
  agentName,
}: {
  run: typeof t.agentRuns.$inferSelect;
  agentName: string | null;
}): MultiRunChildRecord {
  return {
    runId: run.id,
    position: run.multiAgentPosition ?? 0,
    agentId: run.agentId,
    agentName: agentName ?? null,
    provider: run.provider,
    model: run.model,
    status: asChildStatus(run.status),
    error: run.error,
    score: run.score,
    durationMs: run.durationMs,
    costUsd: run.costUsd,
  };
}

/** Reviews (+ findings) persisted by the given runs. A run with no review is simply absent. */
export async function reviewsForRuns(db: Db, runIds: string[]): Promise<MultiRunReviewRecord[]> {
  if (runIds.length === 0) return [];
  const reviews = await db
    .select()
    .from(t.reviews)
    .where(inArray(t.reviews.runId, runIds))
    .orderBy(desc(t.reviews.createdAt));
  if (reviews.length === 0) return [];
  const findings = await db
    .select()
    .from(t.findings)
    .where(inArray(t.findings.reviewId, reviews.map((r) => r.id)));
  return reviews.map((r) => ({
    runId: r.runId!,
    verdict: r.verdict,
    summary: r.summary,
    score: r.score,
    findings: findings.filter((f) => f.reviewId === r.id),
  }));
}

/** Newest multi-run of a PR (workspace-scoped) + its children's statuses. */
export async function latestMultiRunForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<LatestMultiRunRecord | undefined> {
  const [row] = await db
    .select({ id: t.multiAgentRuns.id, ranAt: t.multiAgentRuns.ranAt })
    .from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
    .orderBy(desc(t.multiAgentRuns.ranAt))
    .limit(1);
  if (!row) return undefined;
  const kids = await db
    .select({ status: t.agentRuns.status })
    .from(t.agentRuns)
    .where(eq(t.agentRuns.multiAgentRunId, row.id));
  return { id: row.id, ranAt: row.ranAt, childStatuses: kids.map((k) => asChildStatus(k.status)) };
}

/**
 * Last `ESTIMATE_HISTORY` local `done` runs per agent made with the agent's
 * CURRENT model (one query). Medians are computed by the caller.
 */
export async function doneRunsForEstimates(db: Db, workspaceId: string): Promise<EstimateRunRow[]> {
  const ranked = db
    .select({
      agentId: t.agentRuns.agentId,
      durationMs: t.agentRuns.durationMs,
      costUsd: t.agentRuns.costUsd,
      rn: sql<number>`row_number() over (partition by ${t.agentRuns.agentId} order by ${t.agentRuns.ranAt} desc)`.as(
        'rn',
      ),
    })
    .from(t.agentRuns)
    .innerJoin(
      t.agents,
      and(eq(t.agents.id, t.agentRuns.agentId), eq(t.agents.model, t.agentRuns.model)),
    )
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.status, 'done'),
        eq(t.agentRuns.source, 'local'),
      ),
    )
    .as('ranked');
  const rows = await db.select().from(ranked).where(lte(ranked.rn, ESTIMATE_HISTORY));
  return rows.flatMap((r) =>
    r.agentId ? [{ agentId: r.agentId, durationMs: r.durationMs, costUsd: r.costUsd }] : [],
  );
}
