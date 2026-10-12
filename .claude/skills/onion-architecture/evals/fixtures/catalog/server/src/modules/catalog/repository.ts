import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CatalogItem, CatalogRepo } from './types.js';

export class CatalogRepository implements CatalogRepo {
  constructor(private db: Db) {}

  private toItem(row: typeof t.products.$inferSelect): CatalogItem {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      title: row.title,
      slug: row.slug,
      priceCents: row.priceCents,
      published: row.published,
    };
  }

  async list(workspaceId: string, limit: number, offset: number): Promise<CatalogItem[]> {
    const rows = await this.db
      .select()
      .from(t.products)
      .where(and(eq(t.products.workspaceId, workspaceId), eq(t.products.published, true)))
      .limit(limit)
      .offset(offset);
    return rows.map((r) => this.toItem(r));
  }

  async getById(workspaceId: string, id: string): Promise<CatalogItem | undefined> {
    const [row] = await this.db
      .select()
      .from(t.products)
      .where(and(eq(t.products.workspaceId, workspaceId), eq(t.products.id, id)));
    return row && this.toItem(row);
  }

  async getMany(workspaceId: string, ids: string[]): Promise<CatalogItem[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.products)
      .where(and(eq(t.products.workspaceId, workspaceId), inArray(t.products.id, ids)));
    return rows.map((r) => this.toItem(r));
  }
}
