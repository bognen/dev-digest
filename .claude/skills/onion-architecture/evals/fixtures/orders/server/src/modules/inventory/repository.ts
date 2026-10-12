import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { InventoryLevel, InventoryRepo } from './types.js';

export class InventoryRepository implements InventoryRepo {
  constructor(private db: Db) {}

  async levels(workspaceId: string, skus: string[]): Promise<InventoryLevel[]> {
    const rows = await this.db
      .select({ sku: t.stock.sku, onHand: t.stock.onHand })
      .from(t.stock)
      .where(and(eq(t.stock.workspaceId, workspaceId), inArray(t.stock.sku, skus)));
    return rows;
  }

  async adjust(workspaceId: string, sku: string, delta: number): Promise<void> {
    await this.db
      .update(t.stock)
      .set({ onHand: sql`${t.stock.onHand} + ${delta}` })
      .where(and(eq(t.stock.workspaceId, workspaceId), eq(t.stock.sku, sku)));
  }
}
