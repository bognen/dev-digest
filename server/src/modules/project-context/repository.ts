import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  ActiveSkillRef,
  AgentRef,
  ContextRepoInfo,
  NamedRef,
  ProjectContextRepoPort,
} from './types.js';

/**
 * `agent_context_docs` / `skill_context_docs` plus the read-only slices of
 * `repos` / `agents` / `skills` / `agent_skills` this module needs. The ONLY
 * file in the module that touches `src/db/**`. Every lookup is workspace-scoped.
 */
export class ProjectContextRepository implements ProjectContextRepoPort {
  constructor(private readonly db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<ContextRepoInfo | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        defaultBranch: t.repos.defaultBranch,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)))
      .limit(1);
    return row;
  }

  async getAgent(workspaceId: string, agentId: string): Promise<AgentRef | undefined> {
    const [row] = await this.db
      .select({ id: t.agents.id, name: t.agents.name, provider: t.agents.provider, model: t.agents.model })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)))
      .limit(1);
    return row;
  }

  async getSkill(workspaceId: string, skillId: string): Promise<NamedRef | undefined> {
    const [row] = await this.db
      .select({ id: t.skills.id, name: t.skills.name })
      .from(t.skills)
      .where(and(eq(t.skills.id, skillId), eq(t.skills.workspaceId, workspaceId)))
      .limit(1);
    return row;
  }

  async agentDocs(agentId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)))
      .orderBy(asc(t.agentContextDocs.order), asc(t.agentContextDocs.path));
    return rows.map((r) => r.path);
  }

  async skillDocs(skillId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.order), asc(t.skillContextDocs.path));
    return rows.map((r) => r.path);
  }

  /** Replace the full ordered list (`order = index`) atomically. */
  async setAgentDocs(agentId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)));
      if (paths.length > 0) {
        await tx
          .insert(t.agentContextDocs)
          .values(paths.map((path, order) => ({ agentId, repoId, path, order })));
      }
    });
  }

  async setSkillDocs(skillId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.skillContextDocs)
        .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)));
      if (paths.length > 0) {
        await tx
          .insert(t.skillContextDocs)
          .values(paths.map((path, order) => ({ skillId, repoId, path, order })));
      }
    });
  }

  /** Enabled, non-flagged linked skills by link order (same rule as the run executor). */
  async activeSkillsForAgent(agentId: string): Promise<ActiveSkillRef[]> {
    const rows = await this.db
      .select({ id: t.skills.id, name: t.skills.name })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.skills.enabled, true),
          eq(t.skills.injectionDetected, false),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
    return rows;
  }

  /**
   * path -> distinct agents using it: direct attachments UNION agents linked
   * (via `agent_skills`) to an enabled, non-flagged skill with the path attached.
   * Scoped to the workspace through `agents.workspace_id`.
   */
  async usageCounts(workspaceId: string, repoId: string): Promise<Map<string, number>> {
    const direct = await this.db
      .select({ path: t.agentContextDocs.path, agentId: t.agentContextDocs.agentId })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(and(eq(t.agentContextDocs.repoId, repoId), eq(t.agents.workspaceId, workspaceId)));

    const viaSkills = await this.db
      .select({ path: t.skillContextDocs.path, agentId: t.agentSkills.agentId })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skills.id, t.skillContextDocs.skillId))
      .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(
        and(
          eq(t.skillContextDocs.repoId, repoId),
          eq(t.skills.enabled, true),
          eq(t.skills.injectionDetected, false),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.agents.workspaceId, workspaceId),
        ),
      );

    const byPath = new Map<string, Set<string>>();
    for (const r of [...direct, ...viaSkills]) {
      let set = byPath.get(r.path);
      if (!set) byPath.set(r.path, (set = new Set()));
      set.add(r.agentId);
    }
    return new Map([...byPath].map(([p, s]) => [p, s.size]));
  }
}
