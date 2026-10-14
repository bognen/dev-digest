import { and, eq, lt } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ProjectRecord, ProjectsRepo, TaskRecord } from './types.js';

export class ProjectsRepository implements ProjectsRepo {
  constructor(private db: Db) {}

  private toRecord(row: typeof t.projects.$inferSelect): ProjectRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      archived: row.archived,
      touchedAt: row.touchedAt,
    };
  }

  async list(workspaceId: string, limit: number): Promise<ProjectRecord[]> {
    const rows = await this.db
      .select()
      .from(t.projects)
      .where(and(eq(t.projects.workspaceId, workspaceId), eq(t.projects.archived, false)))
      .limit(limit);
    return rows.map((r) => this.toRecord(r));
  }

  async getById(workspaceId: string, id: string): Promise<ProjectRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.projects)
      .where(and(eq(t.projects.workspaceId, workspaceId), eq(t.projects.id, id)));
    return row && this.toRecord(row);
  }

  async listStale(workspaceId: string, olderThanDays: number): Promise<ProjectRecord[]> {
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
    const rows = await this.db
      .select()
      .from(t.projects)
      .where(and(eq(t.projects.workspaceId, workspaceId), lt(t.projects.touchedAt, cutoff)));
    return rows.map((r) => this.toRecord(r));
  }

  async listTasks(workspaceId: string, projectId: string): Promise<TaskRecord[]> {
    const rows = await this.db
      .select()
      .from(t.tasks)
      .where(and(eq(t.tasks.workspaceId, workspaceId), eq(t.tasks.projectId, projectId)));
    return rows.map((r) => ({ id: r.id, projectId: r.projectId, title: r.title, status: r.status }));
  }

  async archive(workspaceId: string, id: string, tx?: any): Promise<void> {
    await (tx ?? this.db)
      .update(t.projects)
      .set({ archived: true })
      .where(and(eq(t.projects.workspaceId, workspaceId), eq(t.projects.id, id)));
  }

  async reassignTasks(workspaceId: string, fromId: string, toId: string, tx?: any): Promise<void> {
    await (tx ?? this.db)
      .update(t.tasks)
      .set({ projectId: toId })
      .where(and(eq(t.tasks.workspaceId, workspaceId), eq(t.tasks.projectId, fromId)));
  }
}
