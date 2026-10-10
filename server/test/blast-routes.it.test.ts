/**
 * GET /pulls/:id/blast — end to end against Postgres (Testcontainers) with a
 * fake RepoIntel facade. Zero LLM: the injected provider throws if touched.
 * Gated on Docker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { BlastRadiusResponse } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';
import type { BlastResult, IndexState, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let llmCalls = 0;
const throwingLlm = (id: 'openai' | 'anthropic'): LLMProvider => {
  const boom = (): never => {
    llmCalls++;
    throw new Error('LLM must not be called by the blast route');
  };
  return {
    id,
    listModels: async () => boom(),
    complete: async () => boom(),
    completeStructured: async () => boom(),
    embed: async () => boom(),
  } as LLMProvider;
};

interface FakeIntel extends RepoIntel {
  blastCalls: { repoId: string; changedFiles: string[] }[];
}

function fakeRepoIntel(blast: BlastResult, state: Partial<IndexState> = {}): FakeIntel {
  const blastCalls: FakeIntel['blastCalls'] = [];
  const impl = {
    blastCalls,
    getBlastRadius: async (repoId: string, changedFiles: string[]) => {
      blastCalls.push({ repoId, changedFiles });
      return blast;
    },
    getIndexState: async (repoId: string) => ({
      repoId,
      status: 'full',
      filesIndexed: 3,
      filesSkipped: 0,
      durationMs: 1,
      lastIndexedSha: 'sha',
      indexerVersion: 2,
      updatedAt: new Date(0),
      ...state,
    }),
  };
  return impl as unknown as FakeIntel;
}

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function app(intel: RepoIntel) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient({ pulls: [] }),
        repoIntel: intel,
        llm: { openai: throwingLlm('openai'), anthropic: throwingLlm('anthropic') },
      },
    });
  }

  async function seedPr(ws: string, paths: string[]) {
    const db = pg.handle.db;
    const n = ++seq;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `blast${n}`, fullName: `acme/blast${n}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: n,
        title: 'PR',
        author: 'a',
        branch: 'feat',
        base: 'main',
        headSha: 'h',
        status: 'open',
        updatedAt: new Date(),
      })
      .returning();
    await db.insert(t.prFiles).values(paths.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0 })));
    return { repo: repo!, pr: pr! };
  }

  it('returns a contract-valid body with grouping, endpoint attribution and the PR file paths, without any LLM call', async () => {
    const paths = ['src/a.ts', 'src/b.ts'];
    const { repo, pr } = await seedPr(workspaceId, paths);
    const intel = fakeRepoIntel({
      changedSymbols: [
        { file: 'src/a.ts', name: 'alpha', kind: 'function' },
        { file: 'src/b.ts', name: 'beta', kind: 'function' },
      ],
      callers: [
        { file: 'src/api/one.ts', symbol: 'h1', viaSymbol: 'alpha', line: 3, rank: 9 },
        { file: 'src/api/two.ts', symbol: 'h2', viaSymbol: 'beta', line: 4, rank: 8 },
      ],
      impactedEndpoints: ['GET /one', 'POST /two'],
      factsByFile: {
        'src/api/one.ts': { endpoints: ['GET /one'], crons: ['nightly'] },
        'src/api/two.ts': { endpoints: ['POST /two'], crons: [] },
      },
      degraded: false,
    });
    llmCalls = 0;

    const res = await (await app(intel)).inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());

    expect(body.status).toBe('full');
    expect(body.degradedReason).toBeUndefined();
    expect(body.data.downstream.map((g) => g.symbol)).toEqual(['alpha', 'beta']);
    const [alpha, beta] = body.data.downstream;
    expect(alpha!.endpoints_affected).toEqual(['GET /one']);
    expect(alpha!.crons_affected).toEqual(['nightly']);
    expect(beta!.endpoints_affected).toEqual(['POST /two']);
    expect(beta!.crons_affected).toEqual([]);

    expect(intel.blastCalls).toHaveLength(1);
    expect(intel.blastCalls[0]!.repoId).toBe(repo.id);
    expect([...intel.blastCalls[0]!.changedFiles].sort()).toEqual(paths);
    expect(llmCalls).toBe(0);
  });

  it('passes the degraded reason through with the index status', async () => {
    const { pr } = await seedPr(workspaceId, ['src/a.ts']);
    const intel = fakeRepoIntel(
      { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'flag_off' },
      { status: 'degraded', degraded: true, degradedReason: 'index_failed' },
    );
    const res = await (await app(intel)).inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());
    expect(body.status).toBe('degraded');
    expect(body.degradedReason).toBe('flag_off');
  });

  it('404s an unknown PR (structured error), 4xx for a malformed id, and 404s a PR of another workspace', async () => {
    const intel = fakeRepoIntel({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false });
    const a = await app(intel);

    const missing = await a.inject({ method: 'GET', url: `/pulls/${crypto.randomUUID()}/blast` });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: expect.any(String), message: expect.any(String) } });

    const bad = await a.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(bad.statusCode).toBeLessThan(500);

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-blast' }).returning();
    const { pr: foreign } = await seedPr(otherWs!.id, ['src/a.ts']);
    const cross = await a.inject({ method: 'GET', url: `/pulls/${foreign.id}/blast` });
    expect(cross.statusCode).toBe(404);
    expect(intel.blastCalls).toHaveLength(0);
  });
});
