import type { EvalConfigSnapshot, EvalExpectedOutput, Provider } from '@devdigest/shared';
import { reviewPullRequest, type ReviewStrategy } from '@devdigest/reviewer-core';
import { withTimeout } from '../../platform/resilience.js';
import { EVAL_TEMPERATURE } from './constants.js';
import { expectedOf, filesOf, metaOf } from './helpers.js';
import { scoreCase, scoreRun, type CaseOutcomeInput } from './pipeline/scoring.js';
import type { EvalCaseRow, EvalRepository } from './repository.js';
import type { EvalPorts } from './types.js';

/** Upper bound for one case's review call (a hung provider must not stall the run). */
export const EVAL_CASE_TIMEOUT_MS = 180_000;

export interface SuiteJob {
  suiteRunId: string;
  workspaceId: string;
  config: EvalConfigSnapshot;
  /** Resolved skill bodies, in prompt order. */
  skillBodies: string[];
  cases: EvalCaseRow[];
}

/**
 * Executes a suite run in the background: reviews each case on its FROZEN input
 * only (diff + attached files + PR text) with the snapshotted agent config, then
 * scores in code (AC-12 – AC-17, AC-26, AC-61, AC-65). Deliberately absent:
 * repo-intel, callers, agent project-context docs, derived intent (AC-13).
 */
export class EvalRunExecutor {
  constructor(
    private repo: EvalRepository,
    private ports: Pick<EvalPorts, 'llm' | 'parseDiff' | 'logger'>,
  ) {}

  async run(job: SuiteJob): Promise<void> {
    const started = Date.now();
    const { logger } = this.ports;
    const log = { suiteRunId: job.suiteRunId, agentId: job.config.agent_id, agentVersion: job.config.agent_version };
    logger.info({ event: 'eval_run_start', ...log, cases: job.cases.length }, 'eval: run started');

    try {
      const llm = await this.ports.llm(job.config.provider as Provider);
      const outcomes: CaseOutcomeInput[] = [];
      let cost: number | null = 0;

      for (const c of job.cases) {
        const expected: EvalExpectedOutput = expectedOf(c.expectedOutput);
        const caseStart = Date.now();
        let outcome: CaseOutcomeInput;
        let caseCost: number | null = null;
        let droppedDetail: { finding: unknown; reason: string }[] = [];
        try {
          const meta = metaOf(c.inputMeta);
          const files = filesOf(c.inputFiles);
          const review = await withTimeout(
            reviewPullRequest({
              systemPrompt: job.config.system_prompt,
              model: job.config.model,
              diff: this.ports.parseDiff(c.inputDiff ?? ''),
              llm,
              strategy: job.config.strategy as ReviewStrategy,
              ...(job.skillBodies.length ? { skills: job.skillBodies } : {}),
              ...(files.length ? { projectDocs: files } : {}),
              ...(meta.pr_body ? { prDescription: meta.pr_body } : {}),
              task: `Review PR: ${meta.pr_title || c.name}`,
              sessionId: `eval:${job.suiteRunId}:${c.id}`,
              temperature: EVAL_TEMPERATURE,
            }),
            EVAL_CASE_TIMEOUT_MS,
          );
          caseCost = review.costUsd;
          droppedDetail = review.dropped;
          outcome = { expectations: expected.expectations, kept: review.review.findings, droppedCount: review.dropped.length };
        } catch (err) {
          outcome = { expectations: expected.expectations, kept: [], droppedCount: 0, error: (err as Error).message };
        }
        outcomes.push(outcome);
        // Errored cases cost nothing we can see; one unpriced success makes the total unknown.
        if (!outcome.error) cost = cost == null || caseCost == null ? null : cost + caseCost;

        const score = scoreCase(outcome);
        const durationMs = Date.now() - caseStart;
        await this.repo.insertResult({
          suiteRunId: job.suiteRunId,
          caseId: c.id,
          caseName: c.name,
          status: score.status,
          pass: score.status === 'pass',
          expectedSnapshot: expected,
          actualOutput: { kept: outcome.kept, dropped: droppedDetail, matched: score.matched, unmatched: score.unmatched },
          error: outcome.error ?? null,
          durationMs,
          costUsd: caseCost,
        });
        const caseLog = { ...log, caseId: c.id, status: score.status, durationMs, costUsd: caseCost };
        if (outcome.error) logger.warn({ event: 'eval_case_error', ...caseLog, error: outcome.error }, 'eval: case failed');
        else logger.info({ event: 'eval_case_done', ...caseLog, findings: outcome.kept.length }, 'eval: case scored');
      }

      const s = scoreRun(outcomes);
      const errored = outcomes.filter((o) => o.error).length;
      const status = errored === 0 ? 'done' : errored === outcomes.length ? 'failed' : 'partial';
      const durationMs = Date.now() - started;
      await this.repo.finishSuiteRun(job.suiteRunId, {
        status,
        recall: s.recall,
        precision: s.precision,
        citationAccuracy: s.citation_accuracy,
        vacuous: s.vacuous,
        tracesPassed: s.traces_passed,
        tracesTotal: s.traces_total,
        costUsd: cost,
        durationMs,
        error: status === 'failed' ? 'Every case failed' : null,
      });
      logger.info(
        {
          event: 'eval_run_done',
          ...log,
          status,
          recall: s.recall,
          precision: s.precision,
          citationAccuracy: s.citation_accuracy,
          passed: s.traces_passed,
          total: s.traces_total,
          costUsd: cost,
          durationMs,
        },
        'eval: run finished',
      );
    } catch (err) {
      // Infrastructure failure (provider resolution, DB) — the run cannot finish normally.
      await this.repo
        .finishSuiteRun(job.suiteRunId, {
          status: 'failed',
          error: (err as Error).message,
          durationMs: Date.now() - started,
          tracesTotal: job.cases.length,
        })
        .catch(() => undefined);
      logger.error({ event: 'eval_run_failed', ...log, error: (err as Error).message }, 'eval: run failed');
    }
  }
}
