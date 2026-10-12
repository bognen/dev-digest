import { pgTable, uuid, text, integer, primaryKey, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { repos } from './repos';
import { agents } from './agents';
import { skills } from './skills';

// ============================================================ Project context

/**
 * Repo docs (relative paths inside the checkout) attached to an agent. The doc
 * content is never stored: it is read from the checkout at run time. Workspace
 * scoping comes through the agent/repo FKs; the repository enforces it.
 */
export const agentContextDocs = pgTable(
  'agent_context_docs',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
    createdAt: now(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.repoId, t.path] }),
    // Usage counts per doc ("attached to N agents"); the PK covers agent_id.
    repoPathIdx: index('agent_context_docs_repo_path_idx').on(t.repoId, t.path),
  }),
);

/** Same shape as `agentContextDocs`, attached to a skill. */
export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
    createdAt: now(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.skillId, t.repoId, t.path] }),
    repoPathIdx: index('skill_context_docs_repo_path_idx').on(t.repoId, t.path),
  }),
);
