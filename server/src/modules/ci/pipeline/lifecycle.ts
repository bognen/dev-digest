import { ciAgentDir, ciWorkflowPath } from '@devdigest/shared';
import type { CiInstallationStatus } from '@devdigest/shared';

/** Pure installation-lifecycle decisions (AC-96 / AC-97 / AC-98). */

/**
 * Next status of a `removal_pending` installation from its removal PR:
 * merged → `removed` (the caller does this after ingesting its runs, AC-96);
 * closed unmerged → `active` (AC-97); open → unchanged.
 */
export function nextInstallStatusFromRemovalPr(
  state: 'open' | 'closed',
  merged: boolean,
): CiInstallationStatus {
  if (merged) return 'removed';
  if (state === 'closed') return 'active';
  return 'removal_pending';
}

export type RemovalPlan = { kind: 'removed_directly' } | { kind: 'pr'; deletePaths: string[] };

/**
 * Plan a removal from the agent's paths that exist on the default branch.
 * Nothing present → the install PR was never merged: mark removed directly (AC-98).
 * Otherwise a deletion-only PR for exactly the present paths (one of the two may be absent).
 */
export function planRemoval(slug: string, presentPaths: readonly string[]): RemovalPlan {
  const dir = ciAgentDir(slug);
  const workflow = ciWorkflowPath(slug);
  const deletePaths = presentPaths.filter((p) => p.startsWith(dir) || p === workflow);
  return deletePaths.length === 0 ? { kind: 'removed_directly' } : { kind: 'pr', deletePaths };
}
