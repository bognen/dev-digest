import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  AgentDecisionFacts,
  AgentRef,
  AgentRunFacts,
  DayRunFacts,
  RangeBounds,
  SkillRunFacts,
} from './types.js';

/**
 * Agent stats data-access — read-only aggregates over `agent_runs`, `reviews`
 * and `findings`. Every query applies the same "included run" predicate
 * (`includedRun`), so the per-agent Stats tab and the Agent Performance
 * dashboard can never disagree about which runs count.
 */
export class AgentStatsRepository {
  constructor(private db: Db) {}

  /** Agents in the workspace (all of them, or just `agentId`), ordered by name. */
  async agents(workspaceId: string, agentId?: string): Promise<AgentRef[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          agentId === undefined ? undefined : eq(t.agents.id, agentId),
        ),
      )
      .orderBy(asc(t.agents.name));
  }

  /** Included-run facts grouped by agent × model. */
  async runFacts(workspaceId: string, range: RangeBounds, agentIds: string[]): Promise<AgentRunFacts[]> {
    if (agentIds.length === 0) return [];
    const rows = await this.db
      .select({
        agentId: t.agentRuns.agentId,
        model: t.agentRuns.model,
        runs: sql<number>`count(*)`.mapWith(Number),
        pricedRuns: sql<number>`count(${t.agentRuns.costUsd})`.mapWith(Number),
        costSum: sql<number>`coalesce(sum(${t.agentRuns.costUsd}), 0)`.mapWith(Number),
        durationRuns: sql<number>`count(${t.agentRuns.durationMs})`.mapWith(Number),
        durationSum: sql<number>`coalesce(sum(${t.agentRuns.durationMs}), 0)`.mapWith(Number),
        lastRunAt: sql<Date>`max(${t.agentRuns.ranAt})`.mapWith((v) => new Date(v as string)),
      })
      .from(t.agentRuns)
      .where(this.includedRun(workspaceId, range, agentIds))
      .groupBy(t.agentRuns.agentId, t.agentRuns.model);
    return rows.flatMap((r) => (r.agentId === null ? [] : [{ ...r, agentId: r.agentId }]));
  }

  /** Decision + severity counts over findings of the included runs, per agent. */
  async decisionFacts(
    workspaceId: string,
    range: RangeBounds,
    agentIds: string[],
  ): Promise<AgentDecisionFacts[]> {
    if (agentIds.length === 0) return [];
    const f = t.findings;
    const count = (cond: ReturnType<typeof sql>) =>
      sql<number>`count(*) filter (where ${cond})`.mapWith(Number);
    const rows = await this.db
      .select({
        agentId: t.agentRuns.agentId,
        total: sql<number>`count(*)`.mapWith(Number),
        accepted: count(sql`${f.acceptedAt} is not null`),
        dismissed: count(sql`${f.acceptedAt} is null and ${f.dismissedAt} is not null`),
        critical: count(sql`${f.severity} = 'CRITICAL'`),
        warning: count(sql`${f.severity} = 'WARNING'`),
        suggestion: count(sql`${f.severity} = 'SUGGESTION'`),
      })
      .from(t.agentRuns)
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .innerJoin(f, eq(f.reviewId, t.reviews.id))
      .where(this.includedRun(workspaceId, range, agentIds))
      .groupBy(t.agentRuns.agentId);
    return rows.flatMap((r) => (r.agentId === null ? [] : [{ ...r, agentId: r.agentId }]));
  }

  /** Included runs per agent per UTC day (`YYYY-MM-DD`). */
  async runsByDay(workspaceId: string, range: RangeBounds, agentIds: string[]): Promise<DayRunFacts[]> {
    if (agentIds.length === 0) return [];
    const day = sql<string>`to_char(${t.agentRuns.ranAt} at time zone 'UTC', 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({
        agentId: t.agentRuns.agentId,
        day,
        runs: sql<number>`count(*)`.mapWith(Number),
      })
      .from(t.agentRuns)
      .where(this.includedRun(workspaceId, range, agentIds))
      .groupBy(t.agentRuns.agentId, day);
    return rows.flatMap((r) => (r.agentId === null ? [] : [{ ...r, agentId: r.agentId }]));
  }

  /**
   * Included runs per agent × loaded skill (`agent_run_skills`). A run counts
   * once under every skill it loaded — rows overlap by design. Runs with no
   * link (none loaded, or the skill was since deleted) group under null.
   */
  async skillFacts(workspaceId: string, range: RangeBounds, agentIds: string[]): Promise<SkillRunFacts[]> {
    if (agentIds.length === 0) return [];
    const rows = await this.db
      .select({
        agentId: t.agentRuns.agentId,
        skillId: t.agentRunSkills.skillId,
        skillName: t.skills.name,
        runs: sql<number>`count(*)`.mapWith(Number),
        costSum: sql<number>`coalesce(sum(${t.agentRuns.costUsd}), 0)`.mapWith(Number),
      })
      .from(t.agentRuns)
      .leftJoin(t.agentRunSkills, eq(t.agentRunSkills.agentRunId, t.agentRuns.id))
      .leftJoin(t.skills, eq(t.skills.id, t.agentRunSkills.skillId))
      .where(this.includedRun(workspaceId, range, agentIds))
      .groupBy(t.agentRuns.agentId, t.agentRunSkills.skillId, t.skills.name);
    return rows.flatMap((r) => (r.agentId === null ? [] : [{ ...r, agentId: r.agentId }]));
  }

  /** THE inclusion rule: done, local runs of the given agents with `from <= ran_at < to`. */
  private includedRun(workspaceId: string, range: RangeBounds, agentIds: string[]) {
    return and(
      eq(t.agentRuns.workspaceId, workspaceId),
      inArray(t.agentRuns.agentId, agentIds),
      eq(t.agentRuns.status, 'done'),
      eq(t.agentRuns.source, 'local'),
      gte(t.agentRuns.ranAt, range.from),
      lt(t.agentRuns.ranAt, range.to),
    );
  }
}
