import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const charges = pgTable('charges', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  method: text('method').notNull(),
  externalRef: text('external_ref'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
