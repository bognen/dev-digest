import type { BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { DegradedReason, IndexStatus, RepoIntel } from '../repo-intel/types.js';
import { toBlastRadius } from './helpers.js';

/**
 * What blast needs from the PR/file side — declared HERE, not imported from
 * the reviews module (`no-cross-module` forbids `modules/blast` importing
 * `modules/reviews` directly, including type-only). `ReviewRepository`
 * satisfies this structurally, so `routes.ts` — the one ring allowed to know
 * concrete classes — can still pass `container.reviewRepo` while this module
 * stays independent of reviews' internals. Mirrors `reviews/service.ts`'s
 * `AgentLookup` pattern.
 *
 * `RepoIntel` itself is different: it's already the cross-module-safe facade
 * every feature is meant to read repo intelligence through, so it's imported
 * directly from `repo-intel/types.ts` below rather than re-declared here.
 */
export interface PrFileLookup {
  getPull(
    workspaceId: string,
    prId: string,
  ): Promise<{ id: string; repoId: string; number: number; headSha: string } | undefined>;
  getPrFiles(prId: string): Promise<{ path: string }[]>;
}

/**
 * Compile-time guard: repo-intel's status/reason unions must stay assignable
 * to the wire contract in `@devdigest/shared` (the shared kernel owns the
 * envelope; repo-intel owns the vocabulary).
 */
type _StatusAssignable = IndexStatus extends BlastRadiusResponse['status'] ? true : never;
type _ReasonAssignable = DegradedReason extends NonNullable<BlastRadiusResponse['degradedReason']> ? true : never;
export type BlastContractCheck = [_StatusAssignable, _ReasonAssignable];

/** Minimal structural logger (Fastify's `req.log` satisfies it). */
export interface BlastLog {
  info(obj: object, msg: string): void;
}

/**
 * Blast Radius application service — thin read, zero LLM calls, entirely
 * compute-on-request over `repo-intel`'s already-fixed persistent index reads.
 */
export class BlastService {
  constructor(
    private prFiles: PrFileLookup,
    private repoIntel: RepoIntel,
  ) {}

  async getBlast(
    workspaceId: string,
    prId: string,
    opts?: { log?: BlastLog },
  ): Promise<BlastRadiusResponse> {
    const pull = await this.prFiles.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.prFiles.getPrFiles(prId);
    const paths = files.map((f) => f.path);

    const [blast, indexState] = await Promise.all([
      this.repoIntel.getBlastRadius(pull.repoId, paths, { sha: pull.headSha, prNumber: pull.number }),
      this.repoIntel.getIndexState(pull.repoId),
    ]);

    const data = toBlastRadius(blast);
    const envelope: BlastRadiusResponse = {
      status: indexState.status,
      data,
    };
    const degradedReason = blast.reason ?? indexState.degradedReason;
    if (degradedReason) envelope.degradedReason = degradedReason;
    // Counts/ids only — never file contents.
    opts?.log?.info(
      {
        prId,
        repoId: pull.repoId,
        changedFiles: paths.length,
        source: blast.degraded ? 'fallback' : 'index',
        status: envelope.status,
        degradedReason,
        symbols: data.changed_symbols.length,
        callers: data.downstream.reduce((n, g) => n + g.callers.length, 0),
      },
      'blast radius computed',
    );
    return envelope;
  }
}
