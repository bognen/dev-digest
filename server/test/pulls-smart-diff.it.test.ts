/**
 * GET /pulls/:id/smart-diff — end to end against Postgres (Testcontainers).
 * Files grouped by role; finding_lines come only from OPEN `kind='finding'`
 * rows of each agent's LATEST review (older run of the same agent, dismissed
 * findings and lethal_trifecta rows are ignored). Gated on Docker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { SmartDiff } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type Db = PgFixture['handle']['db'];

async function insertReview(db: Db, workspaceId: string, prId: string, agentId: string, createdAt: Date) {
  const [rv] = await db
    .insert(t.reviews)
    .values({
      workspaceId,
      prId,
      agentId,
      runId: null,
      kind: 'review',
      verdict: 'comment',
      summary: 's',
      score: 50,
      model: 'gpt-4.1',
      createdAt,
    })
    .returning();
  return rv!;
}

async function insertFinding(
  db: Db,
  reviewId: string,
  file: string,
  startLine: number,
  opts: { kind?: string; dismissedAt?: Date } = {},
) {
  await db.insert(t.findings).values({
    reviewId,
    file,
    startLine,
    endLine: startLine,
    severity: 'WARNING',
    category: 'bug',
    title: 'f',
    rationale: 'r',
    confidence: 0.9,
    ...(opts.kind ? { kind: opts.kind } : {}),
    ...(opts.dismissedAt ? { dismissedAt: opts.dismissedAt } : {}),
  });
}

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function app() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient({ pulls: [] }) },
    });
  }

  it('groups files by role and anchors only open findings from each agent\'s latest review', async () => {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'sd', fullName: 'acme/sd' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'PR',
        author: 'a',
        branch: 'feat',
        base: 'main',
        headSha: 'h',
        status: 'open',
        updatedAt: new Date(),
      })
      .returning();
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'pnpm-lock.yaml', additions: 900, deletions: 0 },
      { prId: pr!.id, path: 'src/service.ts', additions: 10, deletions: 2 },
      { prId: pr!.id, path: 'src/a.test.ts', additions: 5, deletions: 0 },
      { prId: pr!.id, path: 'src/index.ts', additions: 1, deletions: 1 },
      { prId: pr!.id, path: 'docs/guide.md', additions: 3, deletions: 0 },
    ]);

    const agentId = crypto.randomUUID();
    const older = await insertReview(db, workspaceId, pr!.id, agentId, new Date('2026-06-01T00:00:00Z'));
    const newer = await insertReview(db, workspaceId, pr!.id, agentId, new Date('2026-06-02T00:00:00Z'));
    // Superseded run: must be ignored.
    await insertFinding(db, older.id, 'src/service.ts', 99);
    // Latest run: open (duplicated + unsorted), dismissed, lethal_trifecta, file outside the PR.
    await insertFinding(db, newer.id, 'src/service.ts', 20);
    await insertFinding(db, newer.id, 'src/service.ts', 5);
    await insertFinding(db, newer.id, 'src/service.ts', 20);
    await insertFinding(db, newer.id, 'src/service.ts', 50, { dismissedAt: new Date() });
    await insertFinding(db, newer.id, 'src/a.test.ts', 7, { kind: 'lethal_trifecta' });
    await insertFinding(db, newer.id, 'src/not-in-pr.ts', 1);

    const res = await (await app()).inject({ method: 'GET', url: `/pulls/${pr!.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiff;

    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    const byPath = Object.fromEntries(body.groups.flatMap((g) => g.files).map((x) => [x.path, x]));
    expect(byPath['src/service.ts']!.finding_lines).toEqual([5, 20]);
    expect(byPath['src/a.test.ts']!.finding_lines).toEqual([]);
    expect(byPath['src/service.ts']!.pseudocode_summary).toBeNull();
    expect(byPath['pnpm-lock.yaml']!.additions).toBe(900);
    // boilerplate (900 lines) is excluded from the size total
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 22, proposed_splits: [] });
  });

  it('rejects a non-uuid id with a 4xx and returns 404 for an unknown PR', async () => {
    const a = await app();
    const bad = await a.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(bad.statusCode).toBeLessThan(500);

    const missing = await a.inject({ method: 'GET', url: `/pulls/${crypto.randomUUID()}/smart-diff` });
    expect(missing.statusCode).toBe(404);
  });
});
