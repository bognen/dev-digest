import type { Container } from '../../platform/container.js';
import type {
  AgentEstimatesResponse,
  CancelMultiRunResponse,
  CreateMultiRunResponse,
  FindingActionKind,
  LatestMultiRunResponse,
  MultiRunDetail,
  MultiRunListResponse,
  PrIntentResponse,
  RunEventKind,
  RunTrace,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import { ReviewRepository } from './repository.js';
import { type ReviewDto, type ReviewDtoFinding } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import {
  deriveMultiRunStatus,
  estimatesFromRuns,
  multiRunSummaryToDto,
  multiRunToDto,
  reviewToDto,
} from './helpers.js';
import { IntentService } from './pipeline/intent.js';
import { INTENT_FEATURE, MULTI_RUN_CONCURRENCY } from './constants.js';
import { hunkContexts, toIntentRecord } from './pipeline/intent-signals.js';
import type { IntentDeps } from './types.js';

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;
  private intent: IntentService;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    // Intent Layer: an explicit Deps bundle built from the Container (never the
    // whole Container itself) — see onion-architecture's inner-no-container.
    const intentDeps: IntentDeps = {
      store: this.repo,
      llm: (p) => container.llm(p),
      resolveModel: (ws) => container.resolveFeatureModel(ws, INTENT_FEATURE),
      github: () => container.github(),
    };
    this.intent = new IntentService(intentDeps);
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents, this.intent, container.projectContextService);
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean },
  ): Promise<AgentRow[]> {
    if (opts.all) return this.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.container.runBus.complete(runId);
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[] }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentRow; runId: string }[] = [];
    for (const agent of targets) {
      const runId = await this.repo.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
      });
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [] };
  }

  // ===========================================================================
  // Multi-agent runs (SPEC-07)
  // ===========================================================================

  /**
   * Start one review per selected agent as a single multi-run. Validates
   * EVERYTHING (PR in workspace, every agent in workspace) before inserting
   * anything. The first MULTI_RUN_CONCURRENCY children start `running`, the
   * rest `queued`; execution is fire-and-forget like `runReview`.
   */
  async createMultiRun(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: Logger,
  ): Promise<CreateMultiRunResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // De-duplicate, keeping first-seen order (AC-6).
    const uniqueIds = [...new Set(agentIds)];
    // All agents of the workspace (enabled or not): the UI lists only enabled
    // ones, the API accepts any agent the caller owns.
    const byId = new Map((await this.agents.list(workspaceId)).map((a) => [a.id, a]));
    const targets: AgentRow[] = [];
    for (const id of uniqueIds) {
      const agent = byId.get(id);
      if (!agent) throw new NotFoundError('Agent not found');
      targets.push(agent);
    }
    if (targets.length === 0) throw new AppError('invalid_run_request', 'Select at least one agent', 400);

    const { multiRunId, runIds } = await this.repo.createMultiRunWithChildren(
      workspaceId,
      prId,
      targets.map((agent, position) => ({
        agentId: agent.id,
        provider: agent.provider,
        model: agent.model,
        status: position < MULTI_RUN_CONCURRENCY ? 'running' : 'queued',
        position,
      })),
    );
    const jobs = targets.map((agent, i) => ({ agent, runId: runIds[i]! }));
    logger?.info(
      { multiRunId, prId, agentCount: targets.length, runIds },
      'review: multi-run created',
    );

    void this.executor.executeMultiRun(workspaceId, pull, repo, jobs, multiRunId, logger).catch((err) => {
      logger?.error({ multiRunId, err: (err as Error).message }, 'review: multi-run background execution crashed');
    });

    return {
      multi_run_id: multiRunId,
      runs: jobs.map((j, position) => ({
        run_id: j.runId,
        agent_id: j.agent.id,
        agent_name: j.agent.name,
        position,
      })),
    };
  }

  /** Multi-run read model; 404 when missing or in another workspace (AC-8). */
  async getMultiRun(workspaceId: string, id: string): Promise<MultiRunDetail> {
    const run = await this.repo.getMultiRun(workspaceId, id);
    if (!run) throw new NotFoundError('Multi-agent run not found');
    const children = await this.repo.multiRunChildren(id);
    const reviews = await this.repo.reviewsForRuns(children.map((c) => c.runId));
    return multiRunToDto(run, children, reviews);
  }

  /** Newest multi-run of a PR, or `{ multi_run: null }` when it has none. */
  async latestMultiRun(workspaceId: string, prId: string): Promise<LatestMultiRunResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const latest = await this.repo.latestMultiRunForPull(workspaceId, prId);
    if (!latest) return { multi_run: null };
    return {
      multi_run: {
        id: latest.id,
        status: deriveMultiRunStatus(latest.childStatuses),
        ran_at: latest.ranAt.toISOString(),
      },
    };
  }

  /** One repo's previous multi-runs, newest first. Unknown repo -> empty list. */
  async listMultiRuns(workspaceId: string, repoId: string, limit: number): Promise<MultiRunListResponse> {
    const rows = await this.repo.listMultiRuns(workspaceId, repoId, limit);
    return { multi_runs: rows.map(multiRunSummaryToDto) };
  }

  /** Cancel every child still queued/running; terminal children are untouched (AC-16). */
  async cancelMultiRun(workspaceId: string, id: string, logger?: Logger): Promise<CancelMultiRunResponse> {
    const run = await this.repo.getMultiRun(workspaceId, id);
    if (!run) throw new NotFoundError('Multi-agent run not found');
    const children = await this.repo.multiRunChildren(id);
    const pending = children.filter((c) => c.status === 'queued' || c.status === 'running');
    for (const child of pending) await this.cancelRun(child.runId);
    logger?.info({ multiRunId: id, cancelled: pending.length }, 'review: multi-run cancelled');
    return { cancelled: pending.length };
  }

  /** Per-agent duration/cost estimates; agents without history are omitted. */
  async agentEstimates(workspaceId: string): Promise<AgentEstimatesResponse> {
    const rows = await this.repo.doneRunsForEstimates(workspaceId);
    return {
      estimates: estimatesFromRuns(rows).map((e) => ({
        agent_id: e.agentId,
        duration_ms: e.durationMs,
        cost_usd: e.costUsd,
      })),
    };
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.container.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    return rows.map(({ review, findings }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null),
    );
  }

  async getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return this.repo.getRunTrace(runId);
  }

  // ===========================================================================
  // Intent Layer — GET/POST /pulls/:id/intent
  // ===========================================================================

  /** Read path: no LLM/GitHub calls. 404s if the PR isn't in the workspace. */
  async getIntent(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return this.intent.get(workspaceId, prId);
  }

  /**
   * Derive (or regenerate) the PR's intent. A missing provider key or LLM
   * failure returns 200 with the previous row (or null) + a reason — never 5xx
   * — so the Overview tab never toasts just because a model isn't configured.
   */
  async generateIntent(
    workspaceId: string,
    prId: string,
    opts: { force?: boolean },
    logger?: Logger,
  ): Promise<PrIntentResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const prFiles = await this.repo.getPrFiles(prId);
    const files = prFiles.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions }));
    const hunkHeaders = hunkContexts(prFiles.map((f) => f.patch ?? '').join('\n'));

    const result = await this.intent.ensure(
      { workspaceId, pull, repo: { owner: repo.owner, name: repo.name }, files, hunkHeaders },
      { force: opts.force, trigger: opts.force ? 'regenerate' : 'overview', log: logger },
    );

    if (result.status === 'ok') {
      return { intent: toIntentRecord(result.intent, false), unavailable_reason: null };
    }
    // Reaching 'unavailable' with a previous row means we attempted a
    // regeneration (force, or the cache was already stale) — mark it stale.
    return {
      intent: result.previous ? toIntentRecord(result.previous, true) : null,
      unavailable_reason: result.reason,
    };
  }
}
