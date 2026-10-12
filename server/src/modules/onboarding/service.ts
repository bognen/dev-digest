import type { OnboardingTour, OnboardingTourProvenance, OnboardingTourState, TourSkeletonReason } from '@devdigest/shared';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import {
  LLM_MAX_OUTPUT_TOKENS,
  LLM_TEMPERATURE,
  LLM_TIMEOUT_MS,
  HOTNESS_WINDOW_DAYS,
  MAX_CRITICAL_PATHS,
  MAX_ERROR_DETAIL_CHARS,
  TOUR_TOP_FILES,
  EXCERPT_MAX_BYTES,
} from './constants.js';
import {
  buildSkeleton,
  buildTourFacts,
  classifyLlmError,
  decidePersistence,
  diagnoseInvalidOutput,
  isExcludedFromTour,
  mergeTour,
  normalizeHotness,
  rawOutputOf,
  scoreReadingPath,
  skeletonReasonFor,
  validateLlmOutput,
} from './helpers.js';
import { buildOnboardingMessages, type Excerpt } from './prompt.js';
import { OnboardingLlmOutput } from './schemas.js';
import type {
  DroppedCounts,
  FileHotness,
  IndexStateLite,
  OnboardingDeps,
  OnboardingRepoRef,
  PersistOutcome,
  RepoFacts,
  StoredTour,
  TourFacts,
} from './types.js';

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

const EMPTY_INDEX: IndexStateLite = { status: 'degraded', reason: 'no_data', lastIndexedSha: '', filesIndexed: 0 };
const EMPTY_FACTS: RepoFacts = { stack: [], structure: [], routes: [], commands: [], totalFiles: 0 };

/** Counts-only record of one generation attempt (NFR-5): never content. */
interface AttemptRecord {
  outcome: 'generated' | 'skeleton' | 'failed';
  llmCalls: 0 | 1;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  provider: string | null;
  model: string | null;
  filesIndexed: number;
  filesConsidered: number;
  skeletonReason: TourSkeletonReason | null;
  dropped: DroppedCounts;
  persisted: 'replace' | 'keep' | 'none';
}

/**
 * Application service for the per-repo Onboarding Tour. `getState` never
 * generates (0 LLM calls, AC-1). `generate` is synchronous and makes AT MOST
 * ONE structured LLM call with no retries (NFR-1).
 *
 * Process-wide SINGLETON (lazy container getter): `inFlight` is only a valid
 * guard because there is exactly one instance per process (AC-3). No
 * `Container` import; every dependency is an injected port.
 */
export class OnboardingService {
  private inFlight = new Set<string>();

  constructor(private deps: OnboardingDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  /** GET - AC-1, AC-2, AC-5. */
  async getState(workspaceId: string, repoId: string): Promise<OnboardingTourState> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return this.stateFor(repo);
  }

  /** POST - AC-2, AC-3, AC-4, AC-15..AC-17, NFR-4. */
  async generate(workspaceId: string, repoId: string): Promise<OnboardingTourState> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    // `has` + `add` in one synchronous block, no await between them.
    if (this.inFlight.has(repo.id)) throw new ConflictError('generation_in_progress');
    this.inFlight.add(repo.id);

    let failure: { reason: string; at: string } | null = null;
    try {
      failure = await this.runAttempt(workspaceId, repo);
    } finally {
      this.inFlight.delete(repo.id);
    }
    const state = await this.stateFor(repo);
    // A process error on a repo with no stored tour has nowhere to persist the
    // failure; still surface it on this response.
    return failure && !state.last_failure ? { ...state, last_failure: failure } : state;
  }

  // ---------------------------------------------------------------------------

  private async runAttempt(
    workspaceId: string,
    repo: OnboardingRepoRef,
  ): Promise<{ reason: string; at: string } | null> {
    const { deps } = this;
    const t0 = this.now();
    const rec: AttemptRecord = {
      outcome: 'failed',
      llmCalls: 0,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      provider: null,
      model: null,
      filesIndexed: 0,
      filesConsidered: 0,
      skeletonReason: null,
      dropped: { paths: 0, commands: 0, entries: 0 },
      persisted: 'none',
    };
    let failure: { reason: string; at: string } | null = null;

    try {
      // --- Facts: facade only, no LLM (AC-6). ---
      const indexState = await deps.repoIntel.getIndexState(repo.id).catch(() => EMPTY_INDEX);
      const [repoFacts, ranked, hotness] = await Promise.all([
        deps.repoIntel.getRepoFacts(repo.id).catch((): RepoFacts => EMPTY_FACTS),
        deps.repoIntel.getRankedFiles(repo.id).catch(() => []),
        deps.repoIntel.getFileHotness(repo.id, HOTNESS_WINDOW_DAYS).catch(
          (): FileHotness => ({
            applied: false,
            windowDays: HOTNESS_WINDOW_DAYS,
            anchorSha: null,
            historyDays: 0,
            commitsAvailable: 0,
            reason: 'git_failed',
            counts: {},
          }),
        ),
      ]);
      const critCandidates = ranked
        .filter((r) => !isExcludedFromTour(r.path))
        .sort((a, b) => b.pagerank - a.pagerank || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .slice(0, MAX_CRITICAL_PATHS)
        .map((r) => r.path);
      const symbols =
        critCandidates.length > 0
          ? await deps.repoIntel.getSymbolsInFiles(repo.id, critCandidates).catch(() => [])
          : [];

      const baseFacts = buildTourFacts({ indexState, repoFacts, ranked, hotness, symbols });
      rec.filesIndexed = baseFacts.filesIndexed;

      let tour: OnboardingTour;
      let outcome: PersistOutcome;
      let detail: string | null = null;

      const indexReason = skeletonReasonFor(indexState);
      if (indexReason) {
        // AC-17 / EC-2: no LLM call at all.
        tour = buildSkeleton(baseFacts);
        outcome = { kind: 'skeleton', skeletonReason: indexReason };
      } else {
        const llmResult = await this.callLlm(workspaceId, repo, baseFacts, ranked, hotness, rec);
        tour = llmResult.tour;
        outcome = llmResult.outcome;
        detail = llmResult.detail;
      }

      rec.outcome = outcome.kind === 'generated' ? 'generated' : 'skeleton';
      rec.skeletonReason = outcome.kind === 'skeleton' ? outcome.skeletonReason : null;

      // --- Persistence rule (C1, NFR-4). ---
      const stored = await deps.store.getTour(repo.id);
      const at = this.now();
      const decision = decidePersistence(stored ? { status: stored.status } : null, outcome);
      if (decision === 'replace') {
        const row: StoredTour = {
          repoId: repo.id,
          tour,
          status: outcome.kind === 'generated' ? 'generated' : 'skeleton',
          skeletonReason: outcome.kind === 'skeleton' ? outcome.skeletonReason : null,
          skeletonDetail: detail,
          indexedSha: indexState.lastIndexedSha,
          indexStatus: indexState.status,
          provider: rec.provider,
          model: rec.model,
          filesIndexed: rec.filesIndexed,
          filesConsidered: tour.basis.files_considered,
          tokensIn: rec.tokensIn,
          tokensOut: rec.tokensOut,
          costUsd: rec.costUsd,
          generatedAt: at,
          lastFailureReason: null,
          lastFailureAt: null,
        };
        await deps.store.upsertTour(row);
        rec.persisted = 'replace';
      } else {
        const why =
          outcome.kind === 'skeleton'
            ? `Regeneration did not replace the stored tour (${outcome.skeletonReason}${detail ? `: ${detail}` : ''})`
            : 'Regeneration failed';
        const reason = clip(why, 500);
        await deps.store.recordFailure(repo.id, reason, at);
        failure = { reason, at: at.toISOString() };
        rec.persisted = 'keep';
      }
      rec.filesConsidered = tour.basis.files_considered;
    } catch (err) {
      // Unexpected process error: the stored tour is never touched (NFR-4);
      // only the failure columns are written. Never rethrown.
      rec.outcome = 'failed';
      const at = this.now();
      const reason = clip(`Generation failed unexpectedly (${err instanceof Error ? err.name : 'Error'})`, 500);
      failure = { reason, at: at.toISOString() };
      try {
        await deps.store.recordFailure(repo.id, reason, at);
      } catch {
        // swallow: the repo may have been deleted mid-run (EC-10, EC-14)
      }
    }

    // One structured line per attempt - counts/identifiers only (AC-36, NFR-5).
    // Distinct keys everywhere: no counter name is reused (spread-override trap).
    deps.logger.info(
      {
        repo_id: repo.id,
        repo: repo.fullName,
        outcome: rec.outcome,
        llm_calls: rec.llmCalls,
        tokens_in: rec.tokensIn,
        tokens_out: rec.tokensOut,
        cost_usd: rec.costUsd,
        provider: rec.provider,
        model: rec.model,
        duration_ms: this.now().getTime() - t0.getTime(),
        files_indexed: rec.filesIndexed,
        files_considered: rec.filesConsidered,
        skeleton_reason: rec.skeletonReason,
        persisted: rec.persisted,
        dropped_paths: rec.dropped.paths,
        dropped_commands: rec.dropped.commands,
        dropped_entries: rec.dropped.entries,
      },
      'onboarding.generate',
    );
    return failure;
  }

  /** The single bounded LLM call plus grounding. Never throws. */
  private async callLlm(
    workspaceId: string,
    repo: OnboardingRepoRef,
    baseFacts: TourFacts,
    ranked: Awaited<ReturnType<OnboardingDeps['repoIntel']['getRankedFiles']>>,
    hotness: FileHotness,
    rec: AttemptRecord,
  ): Promise<{ tour: OnboardingTour; outcome: PersistOutcome; detail: string | null }> {
    const { deps } = this;
    let facts = baseFacts;
    const skeletonFor = (reason: TourSkeletonReason, err?: unknown) => ({
      tour: buildSkeleton(facts),
      outcome: { kind: 'skeleton', skeletonReason: reason } as PersistOutcome,
      detail: err === undefined ? null : clip(err instanceof Error ? err.message : String(err), MAX_ERROR_DETAIL_CHARS),
    });

    try {
      // Excerpts for the top candidates, in score order.
      const scored = scoreReadingPath(ranked, normalizeHotness(hotness.counts), hotness.applied).slice(0, TOUR_TOP_FILES);
      const excerpts: Excerpt[] = [];
      if (repo.clonePath) {
        for (const s of scored) {
          const text = await deps.readExcerpt(repo.clonePath, s.path, EXCERPT_MAX_BYTES);
          if (text != null && text.length > 0) excerpts.push({ path: s.path, text });
        }
      }
      const template = await deps.loadSystemTemplate();
      const built = buildOnboardingMessages(facts, excerpts, deps.tokenizer, template);
      facts = { ...facts, filesConsidered: built.filesConsidered };
      rec.filesConsidered = built.filesConsidered;

      const { provider, model } = await deps.resolveModel(workspaceId);
      const llm = await deps.llm(provider);
      rec.provider = provider;
      rec.model = model;

      rec.llmCalls = 1; // exactly one call, no retry (NFR-1)
      let result;
      try {
        result = await llm.completeStructured({
          model,
          schema: OnboardingLlmOutput,
          schemaName: 'OnboardingTour',
          messages: built.messages,
          maxTokens: LLM_MAX_OUTPUT_TOKENS,
          temperature: LLM_TEMPERATURE,
          timeoutMs: LLM_TIMEOUT_MS,
          maxRetries: 0,
          transportRetries: 0,
        });
      } catch (err) {
        const reason = classifyLlmError(err);
        // Content-free diagnosis (paths/codes/length only) instead of the generic message.
        const diagnosis = reason === 'invalid_output' ? diagnoseInvalidOutput(rawOutputOf(err)) : null;
        return diagnosis ? { ...skeletonFor(reason), detail: diagnosis } : skeletonFor(reason, err);
      }
      rec.tokensIn = result.tokensIn;
      rec.tokensOut = result.tokensOut;
      rec.costUsd = result.costUsd ?? deps.estimateCost(model, result.tokensIn, result.tokensOut);

      const validated = validateLlmOutput(result.data, {
        indexPaths: new Set(facts.indexPaths),
        commands: facts.commands,
        readingPaths: facts.readingPath.map((r) => r.path),
        criticalPaths: facts.criticalPaths.map((c) => c.path),
      });
      if (!validated.ok) return skeletonFor('invalid_output', validated.reason);
      rec.dropped = validated.dropped;
      return {
        tour: mergeTour(buildSkeleton(facts), validated.value),
        outcome: { kind: 'generated' },
        detail: null,
      };
    } catch (err) {
      // Failure before/around the call (template, model resolution, missing key).
      return skeletonFor('llm_unavailable', err);
    }
  }

  private async stateFor(repo: OnboardingRepoRef): Promise<OnboardingTourState> {
    const { deps } = this;
    const stored = await deps.store.getTour(repo.id);
    const indexState = await deps.repoIntel.getIndexState(repo.id).catch(() => EMPTY_INDEX);
    const generating = this.inFlight.has(repo.id);
    const status: OnboardingTourState['status'] = generating ? 'generating' : stored ? stored.status : 'none';
    return {
      status,
      repo: { id: repo.id, full_name: repo.fullName },
      tour: stored ? stored.tour : null,
      provenance: stored ? provenanceOf(stored) : null,
      current_index_sha: indexState.lastIndexedSha || null,
      last_failure:
        stored && stored.lastFailureReason && stored.lastFailureAt
          ? { reason: stored.lastFailureReason, at: stored.lastFailureAt.toISOString() }
          : null,
    };
  }
}

function provenanceOf(s: StoredTour): OnboardingTourProvenance {
  return {
    status: s.status,
    skeleton_reason: s.skeletonReason,
    skeleton_detail: s.skeletonDetail,
    generated_at: s.generatedAt.toISOString(),
    indexed_sha: s.indexedSha,
    index_status: s.indexStatus,
    provider: s.provider,
    model: s.model,
    files_indexed: s.filesIndexed,
    files_considered: s.filesConsidered,
    tokens_in: s.tokensIn,
    tokens_out: s.tokensOut,
    cost_usd: s.costUsd,
  };
}
