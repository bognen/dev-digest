import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: text('status').notNull(),
  issuedAt: timestamp('issued_at').notNull().defaultNow(),
});
