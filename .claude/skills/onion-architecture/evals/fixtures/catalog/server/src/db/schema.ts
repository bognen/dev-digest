import { pgTable, uuid, text, integer, boolean } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  priceCents: integer('price_cents').notNull(),
  published: boolean('published').notNull().default(false),
});
