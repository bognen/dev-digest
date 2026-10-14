import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CustomerSummary } from './types.js';

export class CustomersRepository {
  constructor(private db: Db) {}

  async getSummary(workspaceId: string, id: string): Promise<CustomerSummary | undefined> {
    const [row] = await this.db
      .select({ id: t.customers.id, name: t.customers.name, email: t.customers.email })
      .from(t.customers)
      .where(and(eq(t.customers.workspaceId, workspaceId), eq(t.customers.id, id)));
    return row;
  }
}
