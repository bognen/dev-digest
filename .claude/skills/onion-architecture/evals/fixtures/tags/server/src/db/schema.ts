import { pgTable, uuid, text, integer } from 'drizzle-orm/pg-core';

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull(),
  label: text('label').notNull(),
  color: text('color').notNull(),
  usageCount: integer('usage_count').notNull().default(0),
});
