import { and, eq } from 'drizzle-orm';
import type { OnboardingTour, TourSkeletonReason } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { OnboardingRepoRef, OnboardingStore, StoredTour } from './types.js';

/**
 * `onboarding` table (+ the read-only repo lookup this module needs) - the ONLY
 * file in this module that imports `src/db/**`. Returns domain shapes via
 * mappers, never `$inferSelect` rows.
 */
export class OnboardingRepository implements OnboardingStore {
  constructor(private db: Db) {}

  /** Workspace-scoped: a repo in another workspace resolves to `undefined`. */
  async getRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoRef | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    if (!row) return undefined;
    return { id: row.id, owner: row.owner, name: row.name, fullName: row.fullName, clonePath: row.clonePath };
  }

  async getTour(repoId: string): Promise<StoredTour | undefined> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    if (!row) return undefined;
    return {
      repoId: row.repoId,
      tour: row.json as OnboardingTour,
      status: row.status,
      skeletonReason: (row.skeletonReason as TourSkeletonReason | null) ?? null,
      skeletonDetail: row.skeletonDetail,
      indexedSha: row.indexedSha,
      indexStatus: row.indexStatus,
      provider: row.provider,
      model: row.model,
      filesIndexed: row.filesIndexed,
      filesConsidered: row.filesConsidered,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
      generatedAt: row.generatedAt,
      lastFailureReason: row.lastFailureReason,
      lastFailureAt: row.lastFailureAt,
    };
  }

  /** Insert-or-replace the repo's ONE current tour (PK = repoId). */
  async upsertTour(row: StoredTour): Promise<void> {
    const values = {
      repoId: row.repoId,
      json: row.tour,
      status: row.status,
      skeletonReason: row.skeletonReason,
      skeletonDetail: row.skeletonDetail,
      indexedSha: row.indexedSha,
      indexStatus: row.indexStatus,
      provider: row.provider,
      model: row.model,
      filesIndexed: row.filesIndexed,
      filesConsidered: row.filesConsidered,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
      generatedAt: row.generatedAt,
      lastFailureReason: row.lastFailureReason,
      lastFailureAt: row.lastFailureAt,
    };
    await this.db.insert(t.onboarding).values(values).onConflictDoUpdate({ target: t.onboarding.repoId, set: values });
  }

  /** Touches ONLY the failure columns; a no-op when no row exists. */
  async recordFailure(repoId: string, reason: string, at: Date): Promise<void> {
    await this.db
      .update(t.onboarding)
      .set({ lastFailureReason: reason, lastFailureAt: at })
      .where(eq(t.onboarding.repoId, repoId));
  }
}
