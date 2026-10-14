import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ShipmentRecord, ShipmentsRepo } from './types.js';

export class ShipmentsRepository implements ShipmentsRepo {
  constructor(private db: Db) {}

  private toRecord(row: typeof t.shipments.$inferSelect): ShipmentRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      carrier: row.carrier as ShipmentRecord['carrier'],
      trackingNumber: row.trackingNumber,
      status: row.status,
      updatedAt: row.updatedAt,
    };
  }

  async getById(workspaceId: string, id: string): Promise<ShipmentRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.shipments)
      .where(and(eq(t.shipments.workspaceId, workspaceId), eq(t.shipments.id, id)));
    return row && this.toRecord(row);
  }

  async setStatus(workspaceId: string, id: string, status: string): Promise<void> {
    await this.db
      .update(t.shipments)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(t.shipments.workspaceId, workspaceId), eq(t.shipments.id, id)));
  }
}
