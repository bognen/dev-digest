import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const shipments = pgTable('shipments', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  carrier: text('carrier').notNull(),
  trackingNumber: text('tracking_number').notNull(),
  status: text('status').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
