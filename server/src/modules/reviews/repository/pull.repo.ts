import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { IntentConfidence, IntentSource, Provider, type Intent } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';
import type { IntentMeta, StoredIntent } from '../types.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

/** Map a Drizzle `pr_intent` row to the domain shape — Zod-narrows the two
 *  free-text/jsonb columns whose values are otherwise just `string`/`unknown`. */
function toStoredIntent(row: typeof t.prIntent.$inferSelect): StoredIntent {
  return {
    prId: row.prId,
    intent: row.intent,
    inScope: row.inScope,
    outOfScope: row.outOfScope,
    confidence: IntentConfidence.parse(row.confidence),
    sources: z.array(IntentSource).parse(row.sources),
    ticketRefs: row.ticketRefs,
    linkedIssue: row.linkedIssue,
    provider: row.provider ? Provider.parse(row.provider) : null,
    model: row.model,
    inputHash: row.inputHash,
    headSha: row.headSha,
    generatedAt: row.generatedAt,
  };
}

/** Insert-or-replace the PR's intent row: the LLM-authored Intent fields plus
 *  every metadata column, with `generated_at` always bumped to now(). */
export async function upsertIntent(
  db: Db,
  prId: string,
  intent: Intent,
  meta: IntentMeta,
): Promise<void> {
  const common = {
    intent: intent.intent,
    inScope: intent.in_scope,
    outOfScope: intent.out_of_scope,
    confidence: meta.confidence,
    sources: meta.sources,
    ticketRefs: meta.ticketRefs,
    linkedIssue: meta.linkedIssue,
    provider: meta.provider,
    model: meta.model,
    inputHash: meta.inputHash,
    headSha: meta.headSha,
    generatedAt: sql`now()`,
  };
  await db
    .insert(t.prIntent)
    .values({ prId, ...common })
    .onConflictDoUpdate({ target: t.prIntent.prId, set: common });
}

export async function getIntent(db: Db, prId: string): Promise<StoredIntent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  return row ? toStoredIntent(row) : undefined;
}

/** First-line commit subjects for a PR, newest first, already limited to `limit` rows. */
export async function getPrCommitSubjects(db: Db, prId: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ message: t.prCommits.message })
    .from(t.prCommits)
    .where(eq(t.prCommits.prId, prId))
    .orderBy(desc(t.prCommits.committedAt))
    .limit(limit);
  return rows.map((r) => r.message.split('\n')[0] ?? '');
}
