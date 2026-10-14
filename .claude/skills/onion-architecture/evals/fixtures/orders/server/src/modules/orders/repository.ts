import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { NewOrder, OrderLineRecord, OrderRecord, OrdersRepo } from './types.js';

export type OrderRow = typeof t.orders.$inferSelect;

export class OrdersRepository implements OrdersRepo {
  constructor(private db: Db) {}

  private async linesFor(orderId: string): Promise<OrderLineRecord[]> {
    const rows = await this.db.select().from(t.orderLines).where(eq(t.orderLines.orderId, orderId));
    return rows.map((r) => ({ sku: r.sku, qty: r.qty, unitCents: r.unitCents }));
  }

  private async toRecord(row: OrderRow): Promise<OrderRecord> {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      customerId: row.customerId,
      status: row.status,
      totalCents: row.totalCents,
      currency: row.currency as OrderRecord['currency'],
      lines: await this.linesFor(row.id),
      placedAt: row.placedAt,
    };
  }

  async getRow(workspaceId: string, id: string): Promise<OrderRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.workspaceId, workspaceId), eq(t.orders.id, id)));
    return row;
  }

  async getById(workspaceId: string, id: string): Promise<OrderRecord | undefined> {
    const row = await this.getRow(workspaceId, id);
    return row && this.toRecord(row);
  }

  async insert(workspaceId: string, order: NewOrder): Promise<OrderRecord> {
    const [row] = await this.db
      .insert(t.orders)
      .values({
        workspaceId,
        customerId: order.customerId,
        status: 'pending',
        totalCents: order.totalCents,
        currency: order.currency,
      })
      .returning();
    await this.db.insert(t.orderLines).values(order.lines.map((l) => ({ orderId: row!.id, ...l })));
    return this.toRecord(row!);
  }

  async setStatus(workspaceId: string, id: string, status: string): Promise<void> {
    await this.db
      .update(t.orders)
      .set({ status })
      .where(and(eq(t.orders.workspaceId, workspaceId), eq(t.orders.id, id)));
  }
}
