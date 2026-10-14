import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { NoteRecord, NotesRepo } from './types.js';

export class NotesRepository implements NotesRepo {
  constructor(private db: Db) {}

  private toRecord(row: typeof t.notes.$inferSelect): NoteRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
    };
  }

  async list(workspaceId: string, limit: number): Promise<NoteRecord[]> {
    const rows = await this.db
      .select()
      .from(t.notes)
      .where(eq(t.notes.workspaceId, workspaceId))
      .orderBy(desc(t.notes.createdAt))
      .limit(limit);
    return rows.map((r) => this.toRecord(r));
  }

  async getById(workspaceId: string, id: string): Promise<NoteRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.notes)
      .where(and(eq(t.notes.workspaceId, workspaceId), eq(t.notes.id, id)));
    return row && this.toRecord(row);
  }

  async insert(workspaceId: string, title: string, body: string): Promise<NoteRecord> {
    const [row] = await this.db.insert(t.notes).values({ workspaceId, title, body }).returning();
    return this.toRecord(row!);
  }
}
