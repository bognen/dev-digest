/**
 * `GET /agents/:id/stats` and `GET /agent-performance` share one aggregation
 * over stored runs/findings. Checks the inclusion rule (done + local + in range),
 * Stats ↔ dashboard parity, cost reconciliation, validation, and that neither
 * endpoint touches an LLM provider. Gated on Docker (needs Postgres).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { LLMProvider } from '@devdigest/shared';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-stats] Docker not available — skipping integration tests.');
}

type Db = PgFixture['handle']['db'];

const FROM = '2026-09-01T00:00:00.000Z';
const TO = '2026-10-01T00:00:00.000Z';
const IN = new Date('2026-09-15T12:00:00Z');
const BEFORE = new Date('2026-08-31T23:59:59Z');
const AT_TO = new Date(TO); // half-open: excluded

/** Counts any access to an LLM provider — the dashboards must never reach one. */
let llmTouches = 0;
const trapLlm = new Proxy({} as LLMProvider, {
  get() {
    llmTouches++;
    throw new Error('stats endpoints must not call an LLM');
  },
});

async function addRun(
  db: Db,
  o: {
    workspaceId: string;
    agentId: string;
    prId: string;
    ranAt: Date;
    model?: string;
    status?: string;
    source?: 'local' | 'ci';
    costUsd?: number | null;
    durationMs?: number | null;
    decisions?: Array<'accepted' | 'dismissed' | 'open'>;
    skillIds?: string[];
  },
) {
  const [run] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: o.workspaceId,
      agentId: o.agentId,
      prId: o.prId,
      ranAt: o.ranAt,
      provider: 'openai',
      model: o.model ?? 'gpt-4.1',
      status: o.status ?? 'done',
      source: o.source ?? 'local',
      costUsd: o.costUsd === undefined ? 0.01 : o.costUsd,
      durationMs: o.durationMs === undefined ? 1000 : o.durationMs,
    })
    .returning();
  if (o.skillIds?.length) {
    await db.insert(t.agentRunSkills).values(o.skillIds.map((skillId) => ({ agentRunId: run!.id, skillId })));
  }
  if (!o.decisions?.length) return;
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId: o.workspaceId, prId: o.prId, agentId: o.agentId, runId: run!.id, kind: 'review' })
    .returning();
  await db.insert(t.findings).values(
    o.decisions.map((dec, i) => ({
      reviewId: review!.id,
      file: 'a.ts',
      startLine: i + 1,
      endLine: i + 1,
      severity: i === 0 ? 'CRITICAL' : 'WARNING',
      category: 'bug',
      title: `f${i}`,
      rationale: 'r',
      confidence: 0.9,
      acceptedAt: dec === 'accepted' ? new Date() : null,
      dismissedAt: dec === 'dismissed' ? new Date() : null,
    })),
  );
}

d('agent stats + agent performance (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let agentA: string;
  let agentB: string;
  let agentIdle: string;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    // Start from a workspace with no seeded agents/runs so totals are exact.
    await db.delete(t.agentRuns);
    await db.delete(t.agents);
    const [ws] = await db.select().from(t.workspaces);
    const workspaceId = ws!.id;

    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: trapLlm, anthropic: trapLlm, openrouter: trapLlm },
      },
    });

    const mk = async (name: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      });
      return res.json().id as string;
    };
    agentA = await mk('Perf A');
    agentB = await mk('Perf B');
    agentIdle = await mk('Perf Idle');

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'perf', fullName: 'acme/perf' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'PR',
        author: 'dev',
        branch: 'b',
        base: 'main',
        headSha: 'sha',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
      })
      .returning();
    const base = { workspaceId, prId: pr!.id };
    const [s1, s2] = await db
      .insert(t.skills)
      .values(
        ['perf-owasp', 'perf-secrets'].map((name) => ({
          workspaceId,
          name,
          description: name,
          type: 'security' as const,
          source: 'manual' as const,
          body: '# rule',
        })),
      )
      .returning();

    // A — 3 included runs over two models; 1 accepted, 2 dismissed, 1 open.
    await addRun(db, { ...base, agentId: agentA, ranAt: IN, costUsd: 0.1, durationMs: 2000, decisions: ['accepted', 'dismissed', 'open'], skillIds: [s1!.id, s2!.id] });
    await addRun(db, { ...base, agentId: agentA, ranAt: IN, costUsd: 0.2, durationMs: 4000, decisions: ['dismissed'], skillIds: [s1!.id] });
    await addRun(db, { ...base, agentId: agentA, ranAt: IN, model: 'gpt-4o', costUsd: null, durationMs: null });
    // A — excluded: out of range (both edges), failed, CI-sourced.
    await addRun(db, { ...base, agentId: agentA, ranAt: BEFORE, costUsd: 5, decisions: ['accepted'] });
    await addRun(db, { ...base, agentId: agentA, ranAt: AT_TO, costUsd: 5, decisions: ['accepted'] });
    await addRun(db, { ...base, agentId: agentA, ranAt: IN, status: 'failed', costUsd: 5, skillIds: [s1!.id] });
    await addRun(db, { ...base, agentId: agentA, ranAt: IN, source: 'ci', costUsd: 5, decisions: ['accepted'] });
    // B — 1 included run.
    await addRun(db, { ...base, agentId: agentB, ranAt: IN, model: 'gpt-4o', costUsd: 0.05, decisions: ['accepted'] });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const q = `from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`;

  it('per-agent stats count only done, local runs inside [from, to)', async () => {
    const res = await app.inject({ method: 'GET', url: `/agents/${agentA}/stats?${q}` });
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s).toMatchObject({
      runs: 3,
      priced_runs: 2,
      unpriced_runs: 1,
      avg_duration_ms: 3000,
      accepted: 1,
      dismissed: 2,
      decided: 3,
      low_sample: true,
      findings_total: 4,
      pending: 1,
      cost_basis: 'estimate',
      range: { from: FROM, to: TO },
    });
    expect(s.total_cost_usd).toBeCloseTo(0.3, 9);
    expect(s.avg_cost_usd).toBeCloseTo(0.15, 9);
    expect(s.accept_rate).toBeCloseTo(1 / 3, 9);
    expect(s.trend).toHaveLength(30);
  });

  it('breaks cost down by skill over the same included runs (overlapping, no-skill last)', async () => {
    const s = (await app.inject({ method: 'GET', url: `/agents/${agentA}/stats?${q}` })).json();
    const byName = s.cost_by_skill.map((k: { skill_name: string | null; runs: number; cost_usd: number }) => [
      k.skill_name,
      k.runs,
      Math.round(k.cost_usd * 1e6),
    ]);
    expect(byName).toEqual([
      ['perf-owasp', 2, 300_000],
      ['perf-secrets', 1, 100_000],
      [null, 1, 0],
    ]);
  });

  it('the dashboard row equals the Stats-tab numbers for the same agent and range', async () => {
    const perf = (await app.inject({ method: 'GET', url: `/agent-performance?${q}` })).json();
    for (const id of [agentA, agentB, agentIdle]) {
      const stats = (await app.inject({ method: 'GET', url: `/agents/${id}/stats?${q}` })).json();
      const row = perf.agents.find((r: { agent_id: string }) => r.agent_id === id);
      for (const k of Object.keys(row)) expect(stats[k], k).toEqual(row[k]);
    }
  });

  it('totals reconcile with the breakdowns and include idle agents in the table', async () => {
    const perf = (await app.inject({ method: 'GET', url: `/agent-performance?${q}` })).json();
    const micro = (n: number) => Math.round(n * 1e6);
    expect(perf.agent_count).toBe(3);
    expect(perf.totals).toMatchObject({ runs: 4, accepted: 2, decided: 4, accept_rate: 0.5 });
    expect(micro(perf.totals.total_cost_usd)).toBe(micro(0.35));
    const sumAgents = perf.cost_by_agent.reduce((n: number, c: { cost_usd: number }) => n + micro(c.cost_usd), 0);
    const sumModels = perf.cost_by_model.reduce((n: number, c: { cost_usd: number }) => n + micro(c.cost_usd), 0);
    expect(sumAgents).toBe(micro(perf.totals.total_cost_usd));
    expect(sumModels).toBe(micro(perf.totals.total_cost_usd));
    expect(perf.most_active).toMatchObject({ agent_id: agentA, runs: 3 });
    expect(perf.agents.find((r: { agent_id: string }) => r.agent_id === agentIdle)).toMatchObject({ runs: 0, accept_rate: null });
  });

  it('an empty range returns zero runs and no most-active agent', async () => {
    const empty = `from=${encodeURIComponent('2020-01-01T00:00:00Z')}&to=${encodeURIComponent('2020-01-02T00:00:00Z')}`;
    const perf = (await app.inject({ method: 'GET', url: `/agent-performance?${empty}` })).json();
    expect(perf.totals.runs).toBe(0);
    expect(perf.most_active).toBeNull();
    expect(perf.cost_by_agent).toEqual([]);
  });

  it('rejects an inverted or missing range and 404s an unknown agent', async () => {
    const inverted = `from=${encodeURIComponent(TO)}&to=${encodeURIComponent(FROM)}`;
    expect((await app.inject({ method: 'GET', url: `/agent-performance?${inverted}` })).statusCode).toBeGreaterThanOrEqual(400);
    expect((await app.inject({ method: 'GET', url: '/agent-performance' })).statusCode).toBeGreaterThanOrEqual(400);
    const missing = await app.inject({ method: 'GET', url: `/agents/00000000-0000-4000-8000-000000000000/stats?${q}` });
    expect(missing.statusCode).toBe(404);
  });

  it('never touches an LLM provider and writes no runs', async () => {
    const before = await pg.handle.db.select().from(t.agentRuns);
    await app.inject({ method: 'GET', url: `/agent-performance?${q}` });
    await app.inject({ method: 'GET', url: `/agents/${agentA}/stats?${q}` });
    expect(llmTouches).toBe(0);
    expect(await pg.handle.db.select().from(t.agentRuns)).toHaveLength(before.length);
  });
});
