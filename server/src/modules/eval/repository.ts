import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * SPEC-06 eval persistence: cases (`eval_cases`), suite runs
 * (`eval_suite_runs`) and per-case results (`eval_runs`). Every read that takes
 * an id from a request is workspace-scoped (NFR-4).
 */

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type InsertEvalCase = typeof t.evalCases.$inferInsert;
export type EvalSuiteRunRow = typeof t.evalSuiteRuns.$inferSelect;
export type InsertEvalSuiteRun = typeof t.evalSuiteRuns.$inferInsert;
export type EvalResultRow = typeof t.evalRuns.$inferSelect;
export type InsertEvalResult = typeof t.evalRuns.$inferInsert;
export type OwnerKind = EvalCaseRow['ownerKind'];

export interface OwnerRef {
  ownerKind: OwnerKind;
  ownerId: string;
}

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- cases -----------------------------------------------------------------

  listCases(workspaceId: string, owner: OwnerRef): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, owner.ownerKind),
          eq(t.evalCases.ownerId, owner.ownerId),
        ),
      )
      .orderBy(asc(t.evalCases.createdAt));
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  async caseBySourceFinding(workspaceId: string, owner: OwnerRef, findingId: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, owner.ownerKind),
          eq(t.evalCases.ownerId, owner.ownerId),
          eq(t.evalCases.sourceFindingId, findingId),
        ),
      );
    return row;
  }

  /** Insert; returns undefined when the (owner, source finding) unique index already holds a row. */
  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db.insert(t.evalCases).values(values).onConflictDoNothing().returning();
    return row;
  }

  async updateCase(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<InsertEvalCase, 'name' | 'inputDiff' | 'inputFiles' | 'inputMeta' | 'expectedOutput' | 'notes'>>,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  /** Every finding id that already has a case in this workspace (FindingCard "Eval case ✓"). */
  async sourceFindingIds(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ id: t.evalCases.sourceFindingId })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), isNotNull(t.evalCases.sourceFindingId)));
    return rows.map((r) => r.id!).filter(Boolean);
  }

  /** Case counts per owner id (one kind). */
  async countCases(workspaceId: string, ownerKind: OwnerKind): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ ownerId: t.evalCases.ownerId, n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, ownerKind)))
      .groupBy(t.evalCases.ownerId);
    return new Map(rows.map((r) => [r.ownerId, r.n]));
  }

  /** The most recent result per case (any scope). */
  async lastResults(caseIds: string[]): Promise<Map<string, EvalResultRow>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([t.evalRuns.caseId])
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(t.evalRuns.caseId, desc(t.evalRuns.ranAt));
    return new Map(rows.map((r) => [r.caseId!, r]));
  }

  // ---- suite runs --------------------------------------------------------------

  async insertSuiteRun(values: InsertEvalSuiteRun): Promise<EvalSuiteRunRow> {
    const [row] = await this.db.insert(t.evalSuiteRuns).values(values).returning();
    return row!;
  }

  async finishSuiteRun(
    id: string,
    patch: Partial<
      Pick<
        InsertEvalSuiteRun,
        | 'status'
        | 'recall'
        | 'precision'
        | 'citationAccuracy'
        | 'vacuous'
        | 'tracesPassed'
        | 'tracesTotal'
        | 'costUsd'
        | 'durationMs'
        | 'error'
      >
    >,
  ): Promise<void> {
    await this.db
      .update(t.evalSuiteRuns)
      .set({ ...patch, finishedAt: new Date() })
      .where(eq(t.evalSuiteRuns.id, id));
  }

  async getSuiteRun(workspaceId: string, id: string): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, id)));
    return row;
  }

  /** A `running` full run for this owner, if any. */
  async runningRun(workspaceId: string, owner: OwnerRef): Promise<EvalSuiteRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, owner.ownerKind),
          eq(t.evalSuiteRuns.ownerId, owner.ownerId),
          eq(t.evalSuiteRuns.scope, 'full'),
          eq(t.evalSuiteRuns.status, 'running'),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(1);
    return row;
  }

  /** Mark `running` runs started before `before` as failed (interrupted, e.g. by a restart). */
  async failStaleRuns(workspaceId: string, before: Date): Promise<number> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({ status: 'failed', error: 'Interrupted (no result within the time limit)', finishedAt: new Date() })
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.status, 'running'),
          lt(t.evalSuiteRuns.startedAt, before),
        ),
      )
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length;
  }

  /** Full runs of one owner, newest first, optionally since a date. */
  listSuiteRuns(workspaceId: string, owner: OwnerRef, opts: { since?: Date; limit: number }): Promise<EvalSuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.ownerKind, owner.ownerKind),
          eq(t.evalSuiteRuns.ownerId, owner.ownerId),
          eq(t.evalSuiteRuns.scope, 'full'),
          ...(opts.since ? [gte(t.evalSuiteRuns.startedAt, opts.since)] : []),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(opts.limit);
  }

  /** Most recent full runs across the workspace (Eval Dashboard). */
  recentSuiteRuns(workspaceId: string, limit: number): Promise<EvalSuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.scope, 'full')))
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(limit);
  }

  // ---- per-case results ----------------------------------------------------------

  async insertResult(values: InsertEvalResult): Promise<EvalResultRow> {
    const [row] = await this.db.insert(t.evalRuns).values(values).returning();
    return row!;
  }

  resultsForSuiteRun(suiteRunId: string): Promise<EvalResultRow[]> {
    return this.db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.suiteRunId, suiteRunId))
      .orderBy(asc(t.evalRuns.ranAt));
  }

  // ---- cross-entity lookups (agents linking a skill) ------------------------------

  /** Enabled agents of the workspace that link `skillId`, in creation order. */
  async enabledAgentsLinkingSkill(workspaceId: string, skillId: string): Promise<(typeof t.agents.$inferSelect)[]> {
    const rows = await this.db
      .select({ agent: t.agents })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(
        and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)),
      )
      .orderBy(asc(t.agents.createdAt));
    return rows.map((r) => r.agent);
  }
}
