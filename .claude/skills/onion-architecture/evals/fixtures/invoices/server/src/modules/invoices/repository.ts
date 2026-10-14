import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class InvoicesRepository {
  constructor(private db: Db) {}

  async getById(workspaceId: string, id: string): Promise<typeof t.invoices.$inferSelect | undefined> {
    const [row] = await this.db
      .select()
      .from(t.invoices)
      .where(and(eq(t.invoices.workspaceId, workspaceId), eq(t.invoices.id, id)));
    return row;
  }

  async listByCustomer(workspaceId: string, customerId: string): Promise<Array<typeof t.invoices.$inferSelect>> {
    return this.db
      .select()
      .from(t.invoices)
      .where(and(eq(t.invoices.workspaceId, workspaceId), eq(t.invoices.customerId, customerId)));
  }

  async setStatus(workspaceId: string, id: string, status: string): Promise<void> {
    await this.db
      .update(t.invoices)
      .set({ status })
      .where(and(eq(t.invoices.workspaceId, workspaceId), eq(t.invoices.id, id)));
  }
}
