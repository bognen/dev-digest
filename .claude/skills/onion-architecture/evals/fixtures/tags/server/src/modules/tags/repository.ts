import { eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { TagRecord, TagsRepo } from './types.js';

export class TagsRepository implements TagsRepo {
  constructor(private db: Db) {}

  private toRecord(row: typeof t.tags.$inferSelect): TagRecord {
    return { id: row.id, repoId: row.repoId, label: row.label, color: row.color, usageCount: row.usageCount };
  }

  async listForRepo(repoId: string): Promise<TagRecord[]> {
    const rows = await this.db.select().from(t.tags).where(eq(t.tags.repoId, repoId));
    return rows.map((r) => this.toRecord(r));
  }

  async upsert(repoId: string, label: string, color: string): Promise<TagRecord> {
    const [row] = await this.db
      .insert(t.tags)
      .values({ repoId, label, color })
      .onConflictDoUpdate({ target: t.tags.id, set: { color } })
      .returning();
    return this.toRecord(row!);
  }

  async bumpUsage(id: string): Promise<void> {
    await this.db
      .update(t.tags)
      .set({ usageCount: sql`${t.tags.usageCount} + 1` })
      .where(eq(t.tags.id, id));
  }
}
