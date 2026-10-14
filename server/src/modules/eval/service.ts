import { randomUUID } from 'node:crypto';
import type {
  CreateCaseFromFindingResult,
  EvalCaseDetail,
  EvalCaseUpsert,
  EvalConfigSnapshot,
  EvalExpectation,
  EvalOverview,
  EvalOwnerDashboard,
  EvalOwnerKind,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  PromoteResult,
  Provider,
  RunAllResult,
} from '@devdigest/shared';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  DEFAULT_PERIOD_DAYS,
  HISTORY_LIMIT,
  MAX_FILE_BYTES,
  RECENT_RUNS_LIMIT,
  SPARK_POINTS,
  STALE_RUN_MS,
} from './constants.js';
import {
  caseToDto,
  hasMetrics,
  metricDelta,
  regressionAlert,
  resultToDto,
  sinceDate,
  suiteRunToDto,
  toPoint,
} from './helpers.js';
import { deriveCaseName } from './pipeline/naming.js';
import { extractFileSnippet } from './pipeline/snippet.js';
import { validateCase } from './pipeline/validate.js';
import type { EvalCaseRow, EvalRepository, OwnerRef } from './repository.js';
import { EvalRunExecutor } from './run-executor.js';
import type { AgentLike, EvalAgentsPort, EvalPorts, EvalReviewsPort, EvalSkillsPort, SkillRowLike } from './types.js';

export interface EvalServiceDeps extends EvalPorts {
  repo: EvalRepository;
  agents: EvalAgentsPort;
  skills: EvalSkillsPort;
  reviews: EvalReviewsPort;
}

const DIFF_UNAVAILABLE = 'PR diff unavailable — sync the repo and retry';
const FILE_UNAVAILABLE_NOTE = 'File content unavailable — case has diff only';

/**
 * SPEC-06 application service: eval cases (from findings or by hand), suite
 * runs (background, frozen inputs, code-only scoring), history, dashboards,
 * compare/promote and run-all. A process-wide singleton (container) so the
 * in-flight guard below holds across requests.
 */
export class EvalService {
  private executor: EvalRunExecutor;
  /** Owners with a full run being started/executed in this process (AC-15 race guard). */
  private inFlight = new Set<string>();

  constructor(private deps: EvalServiceDeps) {
    this.executor = new EvalRunExecutor(deps.repo, deps);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  // ===================================================================== cases

  /** AC-1 – AC-8, AC-62, AC-64: one click → one case from a decided finding. */
  async createFromFinding(workspaceId: string, findingId: string): Promise<CreateCaseFromFindingResult> {
    const ctx = await this.deps.reviews.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');
    const { finding, review, pull } = ctx;

    const accepted = !!finding.acceptedAt;
    const dismissed = !!finding.dismissedAt;
    if (!accepted && !dismissed) throw new ConflictError('Accept or dismiss the finding first');
    if (!review.agentId) throw new ValidationError('This finding was not produced by an agent');
    const agent = await this.deps.agents.getById(workspaceId, review.agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const owner: OwnerRef = { ownerKind: 'agent', ownerId: agent.id };
    const existing = await this.deps.repo.caseBySourceFinding(workspaceId, owner, finding.id);
    if (existing) return { case: await this.caseDetail(existing), created: false, note: null };

    const repoRow = await this.deps.reviews.getRepo(pull.repoId);
    if (!repoRow) throw new AppError('diff_unavailable', DIFF_UNAVAILABLE, 503);

    let snippet: string | null = null;
    try {
      const raw = await this.deps.loadPrDiff(pull, repoRow);
      snippet = extractFileSnippet(raw, finding.file, finding.startLine, finding.endLine);
    } catch {
      snippet = null;
    }
    if (!snippet) throw new AppError('diff_unavailable', DIFF_UNAVAILABLE, 503);

    let note: string | null = null;
    let files: { path: string; content: string }[] = [];
    try {
      const content = await this.deps.readFileAtRef(
        { owner: repoRow.owner, name: repoRow.name },
        pull.headSha,
        finding.file,
      );
      if (content != null && Buffer.byteLength(content, 'utf8') <= MAX_FILE_BYTES) {
        files = [{ path: finding.file, content }];
      } else {
        note = FILE_UNAVAILABLE_NOTE;
      }
    } catch {
      note = FILE_UNAVAILABLE_NOTE;
    }

    const expectation: EvalExpectation = {
      id: randomUUID(),
      type: accepted ? 'must_find' : 'must_not_flag',
      file: finding.file,
      start_line: finding.startLine,
      end_line: finding.endLine,
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
    };
    const taken = (await this.deps.repo.listCases(workspaceId, owner)).map((c) => c.name);
    const inserted = await this.deps.repo.insertCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      name: deriveCaseName(finding.category, finding.file, finding.startLine, taken),
      inputDiff: snippet,
      inputFiles: files,
      inputMeta: {
        pr_title: pull.title ?? '',
        pr_body: pull.body ?? '',
        source: {
          finding_id: finding.id,
          review_id: finding.reviewId,
          pr_id: pull.id,
          repo: `${repoRow.owner}/${repoRow.name}`,
          pr_number: pull.number,
        },
      },
      expectedOutput: { expectations: [expectation] },
      sourceFindingId: finding.id,
    });
    if (!inserted) {
      // Lost a race with a concurrent create for the same finding (EC-1).
      const winner = await this.deps.repo.caseBySourceFinding(workspaceId, owner, finding.id);
      if (!winner) throw new ConflictError('Case could not be created');
      return { case: await this.caseDetail(winner), created: false, note: null };
    }
    this.deps.logger.info(
      { event: 'eval_case_created', caseId: inserted.id, agentId: agent.id, findingId: finding.id, type: expectation.type },
      'eval: case created from finding',
    );
    return { case: await this.caseDetail(inserted), created: true, note };
  }

  async listCases(workspaceId: string, ownerKind: EvalOwnerKind, ownerId: string): Promise<EvalCaseDetail[]> {
    await this.ownerName(workspaceId, ownerKind, ownerId);
    const rows = await this.deps.repo.listCases(workspaceId, { ownerKind, ownerId });
    const last = await this.deps.repo.lastResults(rows.map((r) => r.id));
    return rows.map((r) => caseToDto(r, last.get(r.id)));
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseDetail> {
    const row = await this.deps.repo.getCase(workspaceId, id);
    if (!row) throw new NotFoundError('Eval case not found');
    return this.caseDetail(row);
  }

  sourceFindingIds(workspaceId: string): Promise<string[]> {
    return this.deps.repo.sourceFindingIds(workspaceId);
  }

  /** AC-43 – AC-47: manual case creation. */
  async createCase(workspaceId: string, body: EvalCaseUpsert): Promise<EvalCaseDetail> {
    await this.ownerName(workspaceId, body.owner_kind, body.owner_id);
    const values = this.validatedValues(body);
    const row = await this.deps.repo.insertCase({
      workspaceId,
      ownerKind: body.owner_kind,
      ownerId: body.owner_id,
      ...values,
    });
    if (!row) throw new ConflictError('Case could not be created');
    return this.caseDetail(row);
  }

  async updateCase(workspaceId: string, id: string, body: EvalCaseUpsert): Promise<EvalCaseDetail> {
    const existing = await this.deps.repo.getCase(workspaceId, id);
    if (!existing) throw new NotFoundError('Eval case not found');
    if (existing.ownerKind !== body.owner_kind || existing.ownerId !== body.owner_id) {
      throw new ValidationError('A case cannot be moved to another owner');
    }
    const prevMeta = (existing.inputMeta ?? {}) as { source?: unknown };
    const values = this.validatedValues(body);
    const row = await this.deps.repo.updateCase(workspaceId, id, {
      ...values,
      inputMeta: { ...(values.inputMeta as object), source: prevMeta.source ?? null },
    });
    if (!row) throw new NotFoundError('Eval case not found');
    return this.caseDetail(row);
  }

  async deleteCase(workspaceId: string, id: string): Promise<void> {
    const ok = await this.deps.repo.deleteCase(workspaceId, id);
    if (!ok) throw new NotFoundError('Eval case not found');
  }

  private validatedValues(body: EvalCaseUpsert) {
    const diff = this.deps.parseDiff(body.input_diff);
    const errors = validateCase(
      { inputDiff: body.input_diff, inputFiles: body.input_files, expectations: body.expectations },
      diff,
    );
    if (errors.length > 0) throw new ValidationError(errors[0]!.message, { errors });
    return {
      name: body.name.trim(),
      inputDiff: body.input_diff,
      inputFiles: body.input_files,
      inputMeta: { pr_title: body.pr_title, pr_body: body.pr_body, source: null },
      expectedOutput: {
        expectations: body.expectations.map((e) => ({ ...e, id: e.id ?? randomUUID() })),
      },
      notes: body.notes ?? null,
    };
  }

  private async caseDetail(row: EvalCaseRow): Promise<EvalCaseDetail> {
    const last = await this.deps.repo.lastResults([row.id]);
    return caseToDto(row, last.get(row.id));
  }

  // ====================================================================== runs

  /** AC-12: run an agent against its whole case set. */
  async startAgentRun(workspaceId: string, agentId: string): Promise<EvalSuiteRun> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const owner: OwnerRef = { ownerKind: 'agent', ownerId: agent.id };
    const cases = await this.deps.repo.listCases(workspaceId, owner);
    if (cases.length === 0) throw new ValidationError('Agent has no eval cases');
    return this.start(workspaceId, owner, agent, await this.activeLinkedSkills(agent.id), cases, 'full');
  }

  /** AC-52 / AC-63: run a skill's cases through a host agent with only that skill attached. */
  async startSkillRun(workspaceId: string, skillId: string, hostAgentId?: string): Promise<EvalSuiteRun> {
    const skill = await this.deps.skills.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    const owner: OwnerRef = { ownerKind: 'skill', ownerId: skill.id };
    const cases = await this.deps.repo.listCases(workspaceId, owner);
    if (cases.length === 0) throw new ValidationError('Skill has no eval cases');
    const host = await this.resolveHost(workspaceId, skill.id, hostAgentId);
    return this.start(workspaceId, owner, host, this.skillUnderTest(skill), cases, 'full');
  }

  /** AC-19: review one case only — stored with scope 'case', kept out of history/trend/compare. */
  async runCase(workspaceId: string, caseId: string, hostAgentId?: string): Promise<EvalSuiteRun> {
    const c = await this.deps.repo.getCase(workspaceId, caseId);
    if (!c) throw new NotFoundError('Eval case not found');
    const owner: OwnerRef = { ownerKind: c.ownerKind, ownerId: c.ownerId };
    if (c.ownerKind === 'agent') {
      const agent = await this.deps.agents.getById(workspaceId, c.ownerId);
      if (!agent) throw new NotFoundError('Agent not found');
      return this.start(workspaceId, owner, agent, await this.activeLinkedSkills(agent.id), [c], 'case');
    }
    const skill = await this.deps.skills.getById(workspaceId, c.ownerId);
    if (!skill) throw new NotFoundError('Skill not found');
    const host = await this.resolveHost(workspaceId, skill.id, hostAgentId);
    return this.start(workspaceId, owner, host, this.skillUnderTest(skill), [c], 'case');
  }

  private async start(
    workspaceId: string,
    owner: OwnerRef,
    host: AgentLike,
    skills: SkillRowLike[],
    cases: EvalCaseRow[],
    scope: 'full' | 'case',
  ): Promise<EvalSuiteRun> {
    // AC-18: fail fast (no run row) when the host's provider has no key.
    try {
      await this.deps.llm(host.provider as Provider);
    } catch (err) {
      throw new ValidationError(`${host.provider} provider is not configured: ${(err as Error).message}`);
    }

    const key = `${owner.ownerKind}:${owner.ownerId}`;
    if (scope === 'full') {
      await this.deps.repo.failStaleRuns(workspaceId, new Date(this.now().getTime() - STALE_RUN_MS));
      if (this.inFlight.has(key) || (await this.deps.repo.runningRun(workspaceId, owner))) {
        throw new ConflictError(`An eval run is already in progress for this ${owner.ownerKind}`);
      }
      this.inFlight.add(key);
    }

    const config: EvalConfigSnapshot = {
      agent_id: host.id,
      agent_name: host.name,
      agent_version: host.version,
      provider: host.provider,
      model: host.model,
      system_prompt: host.systemPrompt,
      strategy: host.strategy,
      skills: skills.map((s) => ({ id: s.id, name: s.name, version: s.version })),
    };
    let row;
    try {
      row = await this.deps.repo.insertSuiteRun({
        workspaceId,
        ownerKind: owner.ownerKind,
        ownerId: owner.ownerId,
        hostAgentId: host.id,
        scope,
        status: 'running',
        agentVersion: host.version,
        configSnapshot: config,
        caseIds: cases.map((c) => c.id),
        tracesTotal: cases.length,
      });
    } catch (err) {
      this.inFlight.delete(key);
      throw err;
    }

    // Fire-and-forget (AC-12 → 202); the executor never throws.
    void this.executor
      .run({ suiteRunId: row.id, workspaceId, config, skillBodies: skills.map((s) => s.body), cases })
      .finally(() => {
        if (scope === 'full') this.inFlight.delete(key);
      });
    return suiteRunToDto(row);
  }

  /** Linked skills that would fire in a normal review (enabled, not injection-flagged). */
  private async activeLinkedSkills(agentId: string): Promise<SkillRowLike[]> {
    const linked = await this.deps.agents.linkedSkills(agentId);
    return linked.map((l) => l.skill).filter((s) => s.enabled && !s.injectionDetected);
  }

  private skillUnderTest(skill: SkillRowLike): SkillRowLike[] {
    if (skill.injectionDetected) throw new ValidationError('Skill is blocked: prompt injection detected');
    return [skill];
  }

  private async resolveHost(workspaceId: string, skillId: string, hostAgentId?: string): Promise<AgentLike> {
    if (hostAgentId) {
      const host = await this.deps.agents.getById(workspaceId, hostAgentId);
      if (!host) throw new NotFoundError('Host agent not found');
      return host;
    }
    const [first] = await this.deps.repo.enabledAgentsLinkingSkill(workspaceId, skillId);
    if (!first) throw new ValidationError('Pick a host agent to run skill evals');
    return first;
  }

  // =================================================================== history

  async listRuns(workspaceId: string, ownerKind: EvalOwnerKind, ownerId: string, days: number): Promise<EvalSuiteRun[]> {
    await this.ownerName(workspaceId, ownerKind, ownerId);
    const rows = await this.deps.repo.listSuiteRuns(
      workspaceId,
      { ownerKind, ownerId },
      { since: sinceDate(days, this.now()), limit: HISTORY_LIMIT },
    );
    return rows.map(suiteRunToDto);
  }

  async getRun(workspaceId: string, id: string): Promise<EvalSuiteRunDetail> {
    const row = await this.deps.repo.getSuiteRun(workspaceId, id);
    if (!row) throw new NotFoundError('Eval run not found');
    const results = await this.deps.repo.resultsForSuiteRun(row.id);
    return { ...suiteRunToDto(row), results: results.map(resultToDto) };
  }

  /** AC-39, AC-41, AC-49: one owner's dashboard (KPIs, delta, alert, trend, history). */
  async dashboard(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
    days = DEFAULT_PERIOD_DAYS,
  ): Promise<EvalOwnerDashboard> {
    const { name, model } = await this.ownerName(workspaceId, ownerKind, ownerId);
    const owner: OwnerRef = { ownerKind, ownerId };
    const [cases, rows, running] = await Promise.all([
      this.deps.repo.listCases(workspaceId, owner),
      this.deps.repo.listSuiteRuns(workspaceId, owner, { since: sinceDate(days, this.now()), limit: HISTORY_LIMIT }),
      this.deps.repo.runningRun(workspaceId, owner),
    ]);
    const history = rows.map(suiteRunToDto);
    // Latest/previous come from ALL time so the delta is meaningful even in a short period.
    const recent = (await this.deps.repo.listSuiteRuns(workspaceId, owner, { limit: 20 }))
      .map(suiteRunToDto)
      .filter(hasMetrics);
    const latest = recent[0] ?? null;
    const previous = recent[1] ?? null;
    const delta = latest && previous ? metricDelta(latest, previous) : null;
    return {
      owner_kind: ownerKind,
      owner_id: ownerId,
      owner_name: name,
      model,
      cases_total: cases.length,
      latest,
      delta,
      alert: delta && latest ? regressionAlert(delta, latest.agent_version) : null,
      running: running ? suiteRunToDto(running) : null,
      trend: history.filter(hasMetrics).reverse().map(toPoint),
      history,
    };
  }

  /** AC-37, AC-38: every agent with ≥1 case + the 20 most recent runs. */
  async overview(workspaceId: string): Promise<EvalOverview> {
    const [agents, skills, agentCounts, recentRows] = await Promise.all([
      this.deps.agents.list(workspaceId),
      this.deps.skills.list(workspaceId),
      this.deps.repo.countCases(workspaceId, 'agent'),
      this.deps.repo.recentSuiteRuns(workspaceId, RECENT_RUNS_LIMIT),
    ]);
    const names = new Map<string, string>([
      ...agents.map((a) => [a.id, a.name] as [string, string]),
      ...skills.map((s) => [s.id, s.name] as [string, string]),
    ]);

    const summaries = [];
    for (const a of agents) {
      const n = agentCounts.get(a.id) ?? 0;
      if (n === 0) continue;
      const owner: OwnerRef = { ownerKind: 'agent', ownerId: a.id };
      const runs = (await this.deps.repo.listSuiteRuns(workspaceId, owner, { limit: SPARK_POINTS + 1 })).map(
        suiteRunToDto,
      );
      const finished = runs.filter(hasMetrics);
      summaries.push({
        agent_id: a.id,
        name: a.name,
        model: a.model,
        enabled: a.enabled,
        cases_total: n,
        latest: finished[0] ?? null,
        spark: finished.slice(0, SPARK_POINTS).reverse().map((r) => r.recall ?? 0),
        running: runs.some((r) => r.status === 'running'),
      });
    }
    return {
      agents: summaries,
      recent_runs: recentRows.map((r) => ({ ...suiteRunToDto(r), owner_name: names.get(r.ownerId) ?? '(deleted)' })),
    };
  }

  // =========================================================== promote / all

  /** AC-34, AC-35: restore a run's config snapshot as the agent's current config. */
  async promote(workspaceId: string, runId: string): Promise<PromoteResult> {
    const run = await this.deps.repo.getSuiteRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Eval run not found');
    if (run.ownerKind !== 'agent') throw new ValidationError('Promote is only available for agent eval runs');
    const agent = await this.deps.agents.getById(workspaceId, run.ownerId);
    if (!agent) throw new NotFoundError('Agent not found');
    const snap = run.configSnapshot as EvalConfigSnapshot;

    const keep: string[] = [];
    const skipped: string[] = [];
    for (const s of snap.skills) {
      const skill = await this.deps.skills.getById(workspaceId, s.id);
      if (skill && !skill.injectionDetected) keep.push(skill.id);
      else skipped.push(s.name);
    }
    await this.deps.agents.setSkills(agent.id, keep);
    const updated = await this.deps.agents.update(workspaceId, agent.id, {
      provider: snap.provider as Provider,
      model: snap.model,
      systemPrompt: snap.system_prompt,
      strategy: snap.strategy as AgentLike['strategy'],
    });
    if (!updated) throw new NotFoundError('Agent not found');
    this.deps.logger.info(
      { event: 'eval_promote', runId, agentId: agent.id, from: agent.version, to: updated.version, skipped },
      'eval: promoted run config',
    );
    return { agent_id: agent.id, agent_version: updated.version, skipped_skills: skipped };
  }

  /** AC-40: start one full run per enabled agent that has ≥1 case. */
  async runAll(workspaceId: string): Promise<RunAllResult> {
    const agents = (await this.deps.agents.list(workspaceId)).filter((a) => a.enabled);
    const counts = await this.deps.repo.countCases(workspaceId, 'agent');
    const result: RunAllResult = { started: [], skipped: [] };
    for (const a of agents) {
      if ((counts.get(a.id) ?? 0) === 0) {
        result.skipped.push({ agent_id: a.id, reason: 'No eval cases' });
        continue;
      }
      try {
        const run = await this.startAgentRun(workspaceId, a.id);
        result.started.push({ agent_id: a.id, run_id: run.id });
      } catch (err) {
        result.skipped.push({ agent_id: a.id, reason: (err as Error).message });
      }
    }
    return result;
  }

  // ==================================================================== shared

  private async ownerName(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<{ name: string; model: string | null }> {
    if (ownerKind === 'agent') {
      const a = await this.deps.agents.getById(workspaceId, ownerId);
      if (!a) throw new NotFoundError('Agent not found');
      return { name: a.name, model: a.model };
    }
    const s = await this.deps.skills.getById(workspaceId, ownerId);
    if (!s) throw new NotFoundError('Skill not found');
    return { name: s.name, model: null };
  }
}

