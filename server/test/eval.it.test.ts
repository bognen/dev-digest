import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  CreateCaseFromFindingResult,
  EvalCaseDetail,
  EvalOverview,
  EvalOwnerDashboard,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  Review,
  SecretsProvider,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * SPEC-06 eval pipeline — integration (Testcontainers pg + mock LLM/git).
 * Covers case creation from findings + by hand, run lifecycle, code-only
 * scoring, history/dashboard/overview, promote, run-all, workspace scoping.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
const DIFF = `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`;
const FILE_CONTENT = 'export const config = {\n  port: 3000,\n  stripeKey: "sk_live_xxx",\n};\n';

/** Model output: one grounded finding on line 11 + one hallucinated (dropped) on 999. */
const FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 's',
  score: 40,
  findings: [
    {
      id: 'a',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'r',
      confidence: 0.9,
      kind: 'finding',
    },
    {
      id: 'b',
      severity: 'WARNING',
      category: 'bug',
      title: 'phantom',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'r',
      confidence: 0.4,
      kind: 'finding',
    },
  ],
};

/** Git mock whose `readFileAtRef` serves the head file (AC-3) unless told otherwise. */
class EvalGit extends MockGitClient {
  constructor(private file: string | null = FILE_CONTENT, private diffFails = false) {
    super({ diff: DIFF });
  }
  override async readFileAtRef(): Promise<string | null> {
    return this.file;
  }
  override async diff(...args: Parameters<MockGitClient['diff']>) {
    if (this.diffFails) throw new Error('git unavailable');
    return super.diff(...args);
  }
}

/** Mock LLM that fails the Nth structured call(s) — AC-16 partial runs. */
class FlakyLLM extends MockLLMProvider {
  private n = 0;
  constructor(private failOn: Set<number>, opts: ConstructorParameters<typeof MockLLMProvider>[1]) {
    super('openai', opts);
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.n++;
    if (this.failOn.has(this.n)) {
      this.calls.push({ method: 'completeStructured', req });
      throw new Error(`provider exploded on call ${this.n}`);
    }
    return super.completeStructured(req);
  }
}

const noSecrets: SecretsProvider = { get: async () => undefined };

d('SPEC-06 eval pipeline (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: PgFixture['handle']['db'];
  let workspaceId: string;
  let llm: MockLLMProvider;
  let app: FastifyInstance;

  async function makeApp(opts: { llm?: MockLLMProvider; git?: MockGitClient; secrets?: SecretsProvider } = {}) {
    const provider = opts.llm ?? llm;
    return buildApp({
      config: config(),
      db,
      overrides: {
        embedder: new MockEmbedder(),
        git: opts.git ?? new EvalGit(),
        llm: { openai: provider, openrouter: provider },
        ...(opts.secrets ? { secrets: opts.secrets } : {}),
      },
    });
  }

  let seq = 0;
  async function createAgent(a: FastifyInstance, overrides: Record<string, unknown> = {}): Promise<string> {
    const res = await a.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Eval Agent ${seq++}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a security reviewer. PROMPT-MARKER-V1',
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  /** PR + review by `agentId` + one finding at src/config.ts:11 with a decision. */
  async function seedFinding(agentId: string | null, decision: 'accepted' | 'dismissed' | null, line = 11) {
    const name = `repo-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add Stripe config',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Wire up payments.',
      })
      .returning();
    await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: PATCH });
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId, kind: 'review', verdict: 'request_changes', model: 'gpt-4.1' })
      .returning();
    const [finding] = await db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: line,
        endLine: line,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe key',
        rationale: 'r',
        confidence: 0.9,
        acceptedAt: decision === 'accepted' ? new Date() : null,
        dismissedAt: decision === 'dismissed' ? new Date() : null,
      })
      .returning();
    return finding!.id;
  }

  async function fromFinding(a: FastifyInstance, findingId: string) {
    return a.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
  }

  async function waitRun(a: FastifyInstance, runId: string): Promise<EvalSuiteRunDetail> {
    let detail: EvalSuiteRunDetail | undefined;
    await vi.waitFor(
      async () => {
        detail = (await a.inject({ method: 'GET', url: `/eval/runs/${runId}` })).json();
        expect(detail!.status).not.toBe('running');
      },
      { timeout: 10_000, interval: 25 },
    );
    return detail!;
  }

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    llm = new MockLLMProvider('openai', { structured: FIXTURE });
    app = await makeApp();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  // --------------------------------------------------------------- case creation

  it('AC-1/AC-3/AC-7: accepted finding → must_find case with frozen diff, file and PR text', async () => {
    const agentId = await createAgent(app);
    const findingId = await seedFinding(agentId, 'accepted');
    const res = await fromFinding(app, findingId);
    expect(res.statusCode).toBe(201);
    const body = res.json<CreateCaseFromFindingResult>();
    expect(body.created).toBe(true);
    expect(body.note).toBeNull();
    const c = body.case;
    expect(c.owner_kind).toBe('agent');
    expect(c.owner_id).toBe(agentId);
    expect(c.name).toBe('security-config-ts-l11');
    expect(c.expected_output.expectations).toHaveLength(1);
    expect(c.expected_output.expectations[0]).toMatchObject({
      type: 'must_find',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
    });
    expect(c.input_diff).toContain('+++ b/src/config.ts');
    expect(c.input_diff).toContain('stripeKey');
    expect(c.input_files).toEqual([{ path: 'src/config.ts', content: FILE_CONTENT }]);
    expect(c.input_meta.pr_title).toBe('Add Stripe config');
    expect(c.input_meta.source?.finding_id).toBe(findingId);
    expect(c.source_finding_id).toBe(findingId);
  });

  it('AC-2: dismissed finding → must_not_flag', async () => {
    const agentId = await createAgent(app);
    const res = await fromFinding(app, await seedFinding(agentId, 'dismissed'));
    expect(res.statusCode).toBe(201);
    expect(res.json<CreateCaseFromFindingResult>().case.expected_output.expectations[0]!.type).toBe('must_not_flag');
  });

  it('AC-6: a second click returns the same case (200, no duplicate)', async () => {
    const agentId = await createAgent(app);
    const findingId = await seedFinding(agentId, 'accepted');
    const first = (await fromFinding(app, findingId)).json<CreateCaseFromFindingResult>();
    const again = await fromFinding(app, findingId);
    expect(again.statusCode).toBe(200);
    expect(again.json<CreateCaseFromFindingResult>()).toMatchObject({ created: false, case: { id: first.case.id } });
    const rows = await db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, findingId));
    expect(rows).toHaveLength(1);
    const sources = (await app.inject({ method: 'GET', url: '/eval/cases/sources' })).json<string[]>();
    expect(sources).toContain(findingId);
  });

  it('AC-5: undecided finding → 409 and nothing created', async () => {
    const agentId = await createAgent(app);
    const res = await fromFinding(app, await seedFinding(agentId, null));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toBe('Accept or dismiss the finding first');
  });

  it('AC-8: unknown finding → 404', async () => {
    expect((await fromFinding(app, randomUUID())).statusCode).toBe(404);
  });

  it('AC-64: diff unavailable → 503 and nothing created', async () => {
    const agentId = await createAgent(app);
    const findingId = await seedFinding(agentId, 'accepted');
    await db.delete(t.prFiles); // no persisted patches either
    const broken = await makeApp({ git: new EvalGit(FILE_CONTENT, true) });
    const res = await fromFinding(broken, findingId);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.message).toBe('PR diff unavailable — sync the repo and retry');
    const rows = await db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, findingId));
    expect(rows).toHaveLength(0);
  });

  it('AC-62: unreadable head file → case created with diff only + note', async () => {
    const agentId = await createAgent(app);
    const noFile = await makeApp({ git: new EvalGit(null) });
    const res = await fromFinding(noFile, await seedFinding(agentId, 'accepted'));
    expect(res.statusCode).toBe(201);
    const body = res.json<CreateCaseFromFindingResult>();
    expect(body.note).toBe('File content unavailable — case has diff only');
    expect(body.case.input_files).toEqual([]);
  });

  // --------------------------------------------------------------- manual cases

  it('AC-43/AC-45/AC-46: manual case validation + CRUD', async () => {
    const agentId = await createAgent(app);
    const base = {
      owner_kind: 'agent',
      owner_id: agentId,
      name: 'manual-stripe',
      input_diff: DIFF,
      pr_title: 'Manual',
      expectations: [{ type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 }],
    };
    const outside = await app.inject({
      method: 'POST',
      url: '/eval/cases',
      payload: { ...base, expectations: [{ type: 'must_find', file: 'src/config.ts', start_line: 900, end_line: 900 }] },
    });
    expect(outside.statusCode).toBe(422);
    expect(outside.json().error.details.errors[0].field).toBe('expectations[0]');

    const tooBig = await app.inject({
      method: 'POST',
      url: '/eval/cases',
      payload: { ...base, input_files: [{ path: 'a.ts', content: 'x'.repeat(100_001) }] },
    });
    expect(tooBig.statusCode).toBe(422);

    const created = await app.inject({ method: 'POST', url: '/eval/cases', payload: base });
    expect(created.statusCode).toBe(201);
    const c = created.json<EvalCaseDetail>();
    expect(c.expected_output.expectations[0]!.id).toBeTruthy();

    const updated = await app.inject({
      method: 'PUT',
      url: `/eval/cases/${c.id}`,
      payload: { ...base, name: 'manual-renamed', expectations: [] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<EvalCaseDetail>()).toMatchObject({ name: 'manual-renamed', expected_output: { expectations: [] } });

    const list = (
      await app.inject({ method: 'GET', url: `/eval/cases?owner_kind=agent&owner_id=${agentId}` })
    ).json<EvalCaseDetail[]>();
    expect(list.map((x) => x.id)).toEqual([c.id]);
  });

  // --------------------------------------------------------------- running + scoring

  it('AC-12/13/14/26/27/47/61/65: full run on frozen inputs, scored in code', async () => {
    const counting = new MockLLMProvider('openai', { structured: FIXTURE });
    const a = await makeApp({ llm: counting });
    const agentId = await createAgent(a);
    // must_find on line 11 (hit) + must_not_flag on line 11 of another PR (violated) + a manual clean case.
    await fromFinding(a, await seedFinding(agentId, 'accepted'));
    await fromFinding(a, await seedFinding(agentId, 'dismissed'));
    const manual = await a.inject({
      method: 'POST',
      url: '/eval/cases',
      payload: { owner_kind: 'agent', owner_id: agentId, name: 'clean', input_diff: DIFF, expectations: [] },
    });
    expect(manual.statusCode).toBe(201);

    const infoSpy = vi.spyOn(console, 'info');
    const start = await a.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    expect(start.statusCode).toBe(202);
    const started = start.json<EvalSuiteRun>();
    expect(started.status).toBe('running');
    expect(started.config.system_prompt).toContain('PROMPT-MARKER-V1');

    const run = await waitRun(a, started.id);
    expect(run.status).toBe('done');
    expect(run.results).toHaveLength(3);
    // 3 cases → exactly 3 structured calls, no other LLM traffic (NFR-1).
    expect(counting.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(3);
    expect(counting.calls.filter((c) => c.method !== 'completeStructured')).toHaveLength(0);

    // recall: 1 must_find, matched → 1. precision: 3 kept findings, 1 TP → 1/3.
    // citation: 3 kept / (3 kept + 3 dropped) = 0.5.
    expect(run.recall).toBe(1);
    expect(run.precision).toBeCloseTo(1 / 3, 10);
    expect(run.citation_accuracy).toBe(0.5);
    expect(run.traces_passed).toBe(1);
    expect(run.traces_total).toBe(3);
    expect(run.cost_usd).toBeCloseTo(0.003, 10);

    const byStatus = run.results.map((r) => r.status).sort();
    expect(byStatus).toEqual(['fail', 'fail', 'pass']);
    const r0 = run.results[0]!;
    expect(r0.kept).toHaveLength(1);
    expect(r0.dropped).toHaveLength(1);
    expect(r0.expected.expectations.length).toBeGreaterThanOrEqual(0);

    // Frozen inputs only: system prompt + case file + diff; no repo map/callers/intent; temperature 0.
    const req = counting.calls[0]!.req as { messages: { role: string; content: string }[]; temperature?: number };
    const prompt = req.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('PROMPT-MARKER-V1');
    expect(prompt).toContain('## Diff to review');
    expect(prompt).toContain('## Project context');
    expect(prompt).toContain('stripeKey: "sk_live_xxx"');
    expect(prompt).not.toContain('## Repo skeleton');
    expect(prompt).not.toContain('## Callers of changed symbols');
    expect(prompt).not.toContain('## Derived intent');
    expect(req.temperature).toBe(0);

    // NFR-5: structured log lines for the run.
    await vi.waitFor(() =>
      expect(infoSpy.mock.calls.some(([o]) => (o as { event?: string })?.event === 'eval_run_done')).toBe(true),
    );
    infoSpy.mockRestore();

    // AC-14: the snapshot survives a later prompt edit.
    await a.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { system_prompt: 'changed' } });
    const again = (await a.inject({ method: 'GET', url: `/eval/runs/${started.id}` })).json<EvalSuiteRunDetail>();
    expect(again.config.system_prompt).toContain('PROMPT-MARKER-V1');
    expect(again.agent_version).toBe(1);
  });

  it('AC-15: a second run while one is running → 409', async () => {
    const slow = new MockLLMProvider('openai', { structured: FIXTURE, structuredDelayMs: 300 });
    const a = await makeApp({ llm: slow });
    const agentId = await createAgent(a);
    await fromFinding(a, await seedFinding(agentId, 'accepted'));
    const first = await a.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    expect(first.statusCode).toBe(202);
    const second = await a.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    expect(second.statusCode).toBe(409);
    await waitRun(a, first.json<EvalSuiteRun>().id);
  });

  it('AC-16/AC-17: one failing case → partial; all failing → failed; zero cases → 422', async () => {
    const flaky = new FlakyLLM(new Set([2]), { structured: FIXTURE });
    const a = await makeApp({ llm: flaky });
    const agentId = await createAgent(a);
    for (let i = 0; i < 3; i++) await fromFinding(a, await seedFinding(agentId, 'accepted'));
    const run = await waitRun(a, (await a.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` })).json().id);
    expect(run.status).toBe('partial');
    expect(run.results.filter((r) => r.status === 'error')).toHaveLength(1);
    expect(run.results.find((r) => r.status === 'error')!.error).toContain('provider exploded');
    expect(run.recall).toBeCloseTo(2 / 3, 10);

    const allFail = await makeApp({ llm: new FlakyLLM(new Set([1, 2, 3]), { structured: FIXTURE }) });
    const failed = await waitRun(
      allFail,
      (await allFail.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` })).json().id,
    );
    expect(failed.status).toBe('failed');

    const empty = await createAgent(a);
    const none = await a.inject({ method: 'POST', url: `/agents/${empty}/eval-runs` });
    expect(none.statusCode).toBe(422);
    expect(none.json().error.message).toBe('Agent has no eval cases');
  });

  it('AC-18: missing provider key → 422 before any run row', async () => {
    const a = await makeApp({ secrets: noSecrets });
    const agentId = await createAgent(a, { provider: 'anthropic', model: 'claude-x' });
    await fromFinding(a, await seedFinding(agentId, 'accepted'));
    const res = await a.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('anthropic');
    const rows = await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.ownerId, agentId));
    expect(rows).toHaveLength(0);
  });

  it('AC-19: a single-case run is kept out of run history', async () => {
    const agentId = await createAgent(app);
    const c = (await fromFinding(app, await seedFinding(agentId, 'accepted'))).json<CreateCaseFromFindingResult>().case;
    const res = await app.inject({ method: 'POST', url: `/eval/cases/${c.id}/run` });
    expect(res.statusCode).toBe(202);
    expect(res.json<EvalSuiteRun>().scope).toBe('case');
    await waitRun(app, res.json<EvalSuiteRun>().id);
    const history = (
      await app.inject({ method: 'GET', url: `/eval/runs?owner_kind=agent&owner_id=${agentId}` })
    ).json<EvalSuiteRun[]>();
    expect(history).toHaveLength(0);
    const cases = (
      await app.inject({ method: 'GET', url: `/eval/cases?owner_kind=agent&owner_id=${agentId}` })
    ).json<EvalCaseDetail[]>();
    expect(cases[0]!.last_result).toMatchObject({ status: 'pass', expected_findings: 1, got_findings: 1 });
  });

  // --------------------------------------------------------------- history + dashboards

  it('AC-11/28/37/38/41/49 + AC-34: history, dashboard, overview, deletion, promote', async () => {
    const agentId = await createAgent(app);
    const c1 = (await fromFinding(app, await seedFinding(agentId, 'accepted'))).json<CreateCaseFromFindingResult>().case;
    await fromFinding(app, await seedFinding(agentId, 'accepted'));

    const run1 = await waitRun(app, (await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` })).json().id);
    // v2 prompt makes the model noisy: every case also flags line 11 + a second grounded line.
    await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { system_prompt: 'Flag everything.' } });
    const noisy: Review = {
      ...FIXTURE,
      findings: [FIXTURE.findings[0]!, { ...FIXTURE.findings[0]!, id: 'c', start_line: 12, end_line: 12 }],
    };
    const noisyApp = await makeApp({ llm: new MockLLMProvider('openai', { structured: noisy }) });
    const run2 = await waitRun(
      noisyApp,
      (await noisyApp.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` })).json().id,
    );
    expect(run2.agent_version).toBe(2);
    expect(run2.precision!).toBeLessThan(run1.precision!);

    const history = (
      await app.inject({ method: 'GET', url: `/eval/runs?owner_kind=agent&owner_id=${agentId}` })
    ).json<EvalSuiteRun[]>();
    expect(history.map((h) => h.id)).toEqual([run2.id, run1.id]);

    const dash = (await app.inject({ method: 'GET', url: `/eval/dashboard/agent/${agentId}` })).json<EvalOwnerDashboard>();
    expect(dash.cases_total).toBe(2);
    expect(dash.latest!.id).toBe(run2.id);
    expect(dash.delta!.precision).toBeLessThan(0);
    expect(dash.alert).toMatch(/^Precision dipped \d+pts on v2$/);
    expect(dash.trend.map((p) => p.run_id)).toEqual([run1.id, run2.id]);

    const overview = (await app.inject({ method: 'GET', url: '/eval/overview' })).json<EvalOverview>();
    const row = overview.agents.find((x) => x.agent_id === agentId)!;
    expect(row.cases_total).toBe(2);
    expect(row.spark).toHaveLength(2);
    expect(overview.recent_runs.length).toBeLessThanOrEqual(20);
    expect(overview.recent_runs.some((r) => r.id === run2.id && r.owner_name.startsWith('Eval Agent'))).toBe(true);

    // AC-11: deleting a case keeps its historical result.
    expect((await app.inject({ method: 'DELETE', url: `/eval/cases/${c1.id}` })).statusCode).toBe(200);
    const old = (await app.inject({ method: 'GET', url: `/eval/runs/${run1.id}` })).json<EvalSuiteRunDetail>();
    expect(old.results).toHaveLength(2);
    expect(old.results.some((r) => r.case_id === null && r.case_name === c1.name)).toBe(true);

    // AC-34: promote run 1 → agent gets v1's prompt back as a new version (3).
    const promoted = await app.inject({ method: 'POST', url: `/eval/runs/${run1.id}/promote` });
    expect(promoted.statusCode).toBe(200);
    expect(promoted.json()).toMatchObject({ agent_id: agentId, agent_version: 3, skipped_skills: [] });
    const agent = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(agent.system_prompt).toContain('PROMPT-MARKER-V1');
  });

  it('AC-40: run-all starts agents with cases and skips the rest', async () => {
    const withCases = await createAgent(app);
    await fromFinding(app, await seedFinding(withCases, 'accepted'));
    const without = await createAgent(app);
    const res = (await app.inject({ method: 'POST', url: '/eval/run-all' })).json();
    expect(res.started.some((s: { agent_id: string }) => s.agent_id === withCases)).toBe(true);
    expect(res.skipped).toContainEqual({ agent_id: without, reason: 'No eval cases' });
    for (const s of res.started) await waitRun(app, s.run_id);
  });

  // --------------------------------------------------------------- skills + scoping

  it('AC-51/52/63: skill evals run on a host agent with only that skill attached', async () => {
    const skillRes = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `eval-skill-${seq++}`, description: 'd', type: 'security', body: 'SKILL-BODY-MARKER rule' },
    });
    expect(skillRes.statusCode).toBe(201);
    const skillId = skillRes.json().id as string;
    const base = {
      owner_kind: 'skill',
      owner_id: skillId,
      name: 'skill-case',
      input_diff: DIFF,
      expectations: [{ type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 }],
    };
    expect((await app.inject({ method: 'POST', url: '/eval/cases', payload: base })).statusCode).toBe(201);

    // No enabled agent links the skill and no host given → 422 with the AC-63 hint.
    const noHost = await app.inject({ method: 'POST', url: `/skills/${skillId}/eval-runs`, payload: {} });
    expect(noHost.statusCode).toBe(422);
    expect(noHost.json().error.message).toBe('Pick a host agent to run skill evals');

    const capture = new MockLLMProvider('openai', { structured: FIXTURE });
    const a = await makeApp({ llm: capture });
    const host = await createAgent(a);
    const started = await a.inject({ method: 'POST', url: `/skills/${skillId}/eval-runs`, payload: { host_agent_id: host } });
    expect(started.statusCode).toBe(202);
    const run = await waitRun(a, started.json().id);
    expect(run.host_agent_id).toBe(host);
    expect(run.config.skills.map((s) => s.id)).toEqual([skillId]);
    const prompt = (capture.calls[0]!.req as { messages: { content: string }[] }).messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('SKILL-BODY-MARKER');
  });

  it('NFR-3: dashboard + cases endpoints p95 ≤ 300 ms with 50 cases and 200 runs', async () => {
    const agentId = await createAgent(app);
    await db.insert(t.evalCases).values(
      Array.from({ length: 50 }, (_, i) => ({
        workspaceId,
        ownerKind: 'agent' as const,
        ownerId: agentId,
        name: `perf-${i}`,
        inputDiff: DIFF,
        inputFiles: [],
        inputMeta: { pr_title: '', pr_body: '' },
        expectedOutput: { expectations: [] },
      })),
    );
    const config = {
      agent_id: agentId,
      agent_name: 'perf',
      agent_version: 1,
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'p',
      strategy: 'single-pass',
      skills: [],
    };
    await db.insert(t.evalSuiteRuns).values(
      Array.from({ length: 200 }, (_, i) => ({
        workspaceId,
        ownerKind: 'agent' as const,
        ownerId: agentId,
        hostAgentId: agentId,
        status: 'done' as const,
        agentVersion: 1,
        configSnapshot: config,
        caseIds: [],
        recall: 0.8,
        precision: 0.9,
        citationAccuracy: 0.95,
        vacuous: { recall: false, precision: false, citation_accuracy: false },
        tracesPassed: 40,
        tracesTotal: 50,
        startedAt: new Date(Date.now() - i * 60_000),
        finishedAt: new Date(Date.now() - i * 60_000 + 1000),
      })),
    );
    const timings: number[] = [];
    for (let i = 0; i < 20; i++) {
      for (const url of [`/eval/dashboard/agent/${agentId}?days=0`, `/eval/cases?owner_kind=agent&owner_id=${agentId}`]) {
        const t0 = performance.now();
        const res = await app.inject({ method: 'GET', url });
        timings.push(performance.now() - t0);
        expect(res.statusCode).toBe(200);
      }
    }
    timings.sort((x, y) => x - y);
    const p95 = timings[Math.floor(timings.length * 0.95) - 1]!;
    expect(p95).toBeLessThanOrEqual(300);
  });

  it('NFR-4: other-workspace / unknown ids → 404', async () => {
    const id = randomUUID();
    for (const [method, url] of [
      ['GET', `/eval/cases/${id}`],
      ['DELETE', `/eval/cases/${id}`],
      ['GET', `/eval/runs/${id}`],
      ['POST', `/eval/runs/${id}/promote`],
      ['POST', `/agents/${id}/eval-runs`],
      ['GET', `/eval/dashboard/agent/${id}`],
      ['GET', `/eval/cases?owner_kind=agent&owner_id=${id}`],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
  });
});
