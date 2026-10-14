import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ChargeRecord } from './types.js';

export class BillingRepository {
  constructor(private db: Db) {}

  private toRecord(row: typeof t.charges.$inferSelect): ChargeRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      invoiceId: row.invoiceId,
      amountCents: row.amountCents,
      method: row.method as ChargeRecord['method'],
      externalRef: row.externalRef,
      createdAt: row.createdAt,
    };
  }

  async listForInvoice(workspaceId: string, invoiceId: string): Promise<ChargeRecord[]> {
    const rows = await this.db
      .select()
      .from(t.charges)
      .where(and(eq(t.charges.workspaceId, workspaceId), eq(t.charges.invoiceId, invoiceId)));
    return rows.map((r) => this.toRecord(r));
  }

  async insert(workspaceId: string, c: Omit<ChargeRecord, 'id' | 'workspaceId' | 'createdAt'>): Promise<ChargeRecord> {
    const [row] = await this.db.insert(t.charges).values({ workspaceId, ...c }).returning();
    return this.toRecord(row!);
  }
}
