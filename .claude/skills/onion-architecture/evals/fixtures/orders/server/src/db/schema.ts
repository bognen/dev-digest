import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  status: text('status').notNull(),
  totalCents: integer('total_cents').notNull(),
  currency: text('currency').notNull(),
  placedAt: timestamp('placed_at').notNull().defaultNow(),
});

export const orderLines = pgTable('order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull(),
  sku: text('sku').notNull(),
  qty: integer('qty').notNull(),
  unitCents: integer('unit_cents').notNull(),
});

export const stock = pgTable('stock', {
  sku: text('sku').primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  onHand: integer('on_hand').notNull(),
});
