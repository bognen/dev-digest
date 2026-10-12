import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { renderProjectContext } from '@devdigest/reviewer-core';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * SPEC-01 Project Context - API-level integration (discovery list, attachments,
 * usage counts, token totals, refresh, checkout-unavailable, size limit,
 * repo pinning, workspace isolation). Real Postgres (Testcontainers) + real
 * filesystem checkout (tmpdir); no LLM/GitHub involved.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type Files = Record<string, string | Buffer>;

const tmpRoots: string[] = [];
function mkCheckout(files: Files): string {
  const root = mkdtempSync(join(tmpdir(), 'pc-it-'));
  tmpRoots.push(root);
  for (const [rel, content] of Object.entries(files)) writeFile(root, rel, content);
  return root;
}
function writeFile(root: string, rel: string, content: string | Buffer): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

d('project context API (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient() },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  });

  const db = () => pg.handle.db;

  async function mkRepo(clonePath: string | null, ws = workspaceId) {
    const n = ++seq;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `pc-${n}`, fullName: `acme/pc-${n}`, clonePath })
      .returning();
    return repo!;
  }
  async function mkAgent(ws = workspaceId) {
    const [a] = await db()
      .insert(t.agents)
      .values({ workspaceId: ws, name: `pc-agent-${++seq}`, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'review' })
      .returning();
    return a!;
  }
  async function mkSkill(opts: { enabled?: boolean; injectionDetected?: boolean } = {}, ws = workspaceId) {
    const [s] = await db()
      .insert(t.skills)
      .values({
        workspaceId: ws,
        name: `pc-skill-${++seq}`,
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'body',
        enabled: opts.enabled ?? true,
        injectionDetected: opts.injectionDetected ?? false,
      })
      .returning();
    return s!;
  }
  async function link(agentId: string, skillId: string, order = 0) {
    await db().insert(t.agentSkills).values({ agentId, skillId, order });
  }
  const putAgent = (agentId: string, repoId: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/agents/${agentId}/context`, payload: { repo_id: repoId, paths } });
  const putSkill = (skillId: string, repoId: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/skills/${skillId}/context`, payload: { repo_id: repoId, paths } });

  it('AC-1/AC-2/EC-10: lists only .md under specs/docs/insights at any depth, by full path, with labels', async () => {
    const root = mkCheckout({
      'specs/a.md': '# A',
      'specs/readme.md': 'spec readme',
      'docs/x/y/b.md': '# B',
      'docs/x/readme.md': 'docs readme',
      'insights/c.md': '# C',
      'README.md': 'root readme - excluded',
      'docs/a.txt': 'not markdown',
      'docs/node_modules/z.md': 'ignored dir',
      'src/notes.md': 'outside roots',
    });
    const repo = await mkRepo(root);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.roots).toEqual(['specs', 'docs', 'insights']);
    expect(body.docs.map((x: { path: string }) => x.path).sort()).toEqual([
      'docs/x/readme.md',
      'docs/x/y/b.md',
      'insights/c.md',
      'specs/a.md',
      'specs/readme.md',
    ]);
    const byPath = new Map<string, { root: string; tokens: number; used_by_agents: number }>(
      body.docs.map((x: { path: string }) => [x.path, x]),
    );
    expect(byPath.get('docs/x/y/b.md')!.root).toBe('docs');
    expect(byPath.get('insights/c.md')!.root).toBe('insights');
    expect(byPath.get('specs/a.md')!.tokens).toBeGreaterThan(0);
    expect(byPath.get('specs/a.md')!.used_by_agents).toBe(0);

    // Preview returns the full content of a listed doc.
    const doc = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/context/file?path=${encodeURIComponent('docs/x/y/b.md')}`,
    });
    expect(doc.statusCode).toBe(200);
    expect(doc.json().content).toBe('# B');
  });

  it('AC-6: usage counter counts distinct agents (direct or via an active skill), agent counted once', async () => {
    const root = mkCheckout({ 'specs/shared.md': 'shared', 'specs/solo.md': 'solo' });
    const repo = await mkRepo(root);
    const [agentA, agentB, agentC] = [await mkAgent(), await mkAgent(), await mkAgent()];
    const skill = await mkSkill();
    const offSkill = await mkSkill({ enabled: false });
    const agentD = await mkAgent();

    // A: directly AND through the skill -> counted once. B: directly. C: via skill only.
    // D: via a disabled skill -> not counted.
    await link(agentA.id, skill.id);
    await link(agentC.id, skill.id);
    await link(agentD.id, offSkill.id);
    expect((await putAgent(agentA.id, repo.id, ['specs/shared.md'])).statusCode).toBe(200);
    expect((await putAgent(agentB.id, repo.id, ['specs/shared.md'])).statusCode).toBe(200);
    expect((await putSkill(skill.id, repo.id, ['specs/shared.md'])).statusCode).toBe(200);
    expect((await putSkill(offSkill.id, repo.id, ['specs/shared.md', 'specs/solo.md'])).statusCode).toBe(200);

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    const used = Object.fromEntries(list.docs.map((x: { path: string; used_by_agents: number }) => [x.path, x.used_by_agents]));
    expect(used['specs/shared.md']).toBe(3);
    expect(used['specs/solo.md']).toBe(0);
  });

  it('AC-10/11/12/15: attach persists across re-fetch, order persists, detach leaves the file untouched', async () => {
    const root = mkCheckout({ 'specs/a.md': 'AAA', 'docs/b.md': 'BBB' });
    const repo = await mkRepo(root);
    const agent = await mkAgent();
    const skill = await mkSkill();

    const put1 = await putAgent(agent.id, repo.id, ['docs/b.md', 'specs/a.md']);
    expect(put1.statusCode).toBe(200);
    const get1 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` })).json();
    expect(get1.attached.map((x: { path: string }) => x.path)).toEqual(['docs/b.md', 'specs/a.md']);
    expect(get1.discovered_count).toBe(2);

    // Reorder.
    await putAgent(agent.id, repo.id, ['specs/a.md', 'docs/b.md']);
    const get2 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` })).json();
    expect(get2.attached.map((x: { path: string }) => x.path)).toEqual(['specs/a.md', 'docs/b.md']);

    // Detach one; file unchanged.
    await putAgent(agent.id, repo.id, ['docs/b.md']);
    const get3 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` })).json();
    expect(get3.attached.map((x: { path: string }) => x.path)).toEqual(['docs/b.md']);
    expect(readFileSync(join(root, 'specs/a.md'), 'utf8')).toBe('AAA');

    // Skill attachments persist too (AC-15) and expose the serialized preview.
    expect((await putSkill(skill.id, repo.id, ['specs/a.md'])).statusCode).toBe(200);
    const sk = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/context?repo_id=${repo.id}` })).json();
    expect(sk.attached.map((x: { path: string }) => x.path)).toEqual(['specs/a.md']);
    expect(sk.serialized).toContain('## Project context');
    expect(sk.serialized).toContain('AAA');

    // The preview groups documents by type, so it shows exactly what the prompt will contain.
    expect((await putSkill(skill.id, repo.id, ['docs/b.md', 'specs/a.md'])).statusCode).toBe(200);
    const grouped = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/context?repo_id=${repo.id}` })).json();
    const text: string = grouped.serialized;
    expect(text.indexOf('### Specs')).toBeGreaterThan(-1);
    expect(text.indexOf('### Specs')).toBeLessThan(text.indexOf('### Docs'));
    expect(text.indexOf('project-doc:specs/a.md')).toBeLessThan(text.indexOf('project-doc:docs/b.md'));
  });

  it('AC-16/AC-17/AC-18/AC-20: inherited rows come only from enabled, non-flagged skills; shared doc marked duplicate', async () => {
    const root = mkCheckout({ 'specs/own.md': 'own', 'specs/s1.md': 's1', 'specs/off.md': 'off', 'specs/bad.md': 'bad' });
    const repo = await mkRepo(root);
    const agent = await mkAgent();
    const s1 = await mkSkill();
    const sOff = await mkSkill({ enabled: false });
    const sBad = await mkSkill({ injectionDetected: true });
    await link(agent.id, s1.id, 0);
    await link(agent.id, sOff.id, 1);
    await link(agent.id, sBad.id, 2);
    await putAgent(agent.id, repo.id, ['specs/own.md']);
    await putSkill(s1.id, repo.id, ['specs/own.md', 'specs/s1.md']);
    await putSkill(sOff.id, repo.id, ['specs/off.md']);
    await putSkill(sBad.id, repo.id, ['specs/bad.md']);

    const state = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` })).json();
    expect(state.inherited.map((x: { path: string }) => x.path)).toEqual(['specs/own.md', 'specs/s1.md']);
    expect(state.inherited[0].duplicate).toBe(true);
    expect(state.inherited[1].duplicate).toBe(false);
    expect(state.inherited[1].skill_id).toBe(s1.id);
  });

  it('AC-23/AC-22: agent token total equals the token count of the rendered block (inherited + dedupe + wrappers)', async () => {
    const files = { 'specs/b.md': 'Bravo text', 'specs/a.md': 'Alpha text', 'docs/c.md': 'Привет мир `code`' };
    const root = mkCheckout(files);
    const repo = await mkRepo(root);
    const agent = await mkAgent();
    const skill = await mkSkill();
    await link(agent.id, skill.id);
    await putAgent(agent.id, repo.id, ['specs/b.md', 'specs/a.md']);
    await putSkill(skill.id, repo.id, ['specs/a.md', 'docs/c.md']);

    const state = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` })).json();
    const block = renderProjectContext([
      { path: 'specs/b.md', content: files['specs/b.md'] },
      { path: 'specs/a.md', content: files['specs/a.md'] },
      { path: 'docs/c.md', content: files['docs/c.md'] },
    ]);
    expect(block).not.toBeNull();
    expect(state.total_tokens).toBe(app.container.tokenizer.count(block!));

    // Skill total = count of the skill's own serialized block (AC-24).
    const sk = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/context?repo_id=${repo.id}` })).json();
    expect(sk.total_tokens).toBe(app.container.tokenizer.count(sk.serialized));
  });

  it('AC-5/AC-22: refresh resyncs and picks up changed content and token count', async () => {
    const root = mkCheckout({ 'specs/a.md': 'short' });
    const repo = await mkRepo(root);
    const before = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    const t0 = before.docs[0].tokens as number;

    writeFile(root, 'specs/a.md', 'a much longer document body '.repeat(200));
    writeFile(root, 'docs/new.md', 'brand new');
    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/context/refresh` });
    expect(res.statusCode).toBe(200);
    const after = res.json();
    expect(after.docs.map((x: { path: string }) => x.path)).toEqual(['docs/new.md', 'specs/a.md']);
    expect(after.docs.find((x: { path: string }) => x.path === 'specs/a.md').tokens).toBeGreaterThan(t0);
  });

  it('AC-8: unsynced or missing checkout gives 409 checkout_unavailable with a reason, not an empty list', async () => {
    const unsynced = await mkRepo(null);
    const r1 = await app.inject({ method: 'GET', url: `/repos/${unsynced.id}/context` });
    expect(r1.statusCode).toBe(409);
    expect(r1.json().error.code).toBe('checkout_unavailable');
    expect(r1.json().error.message).toBeTruthy();

    const gone = await mkRepo(join(tmpdir(), 'pc-it-does-not-exist-xyz'));
    const r2 = await app.inject({ method: 'GET', url: `/repos/${gone.id}/context` });
    expect(r2.statusCode).toBe(409);
    expect(r2.json().error.code).toBe('checkout_unavailable');
  });

  it('AC-7: a checkout with no docs lists an empty array and names the scanned roots', async () => {
    const repo = await mkRepo(mkCheckout({ 'README.md': 'x', 'src/a.ts': 'x' }));
    const res = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(res.docs).toEqual([]);
    expect(res.roots).toEqual(['specs', 'docs', 'insights']);
  });

  it('AC-13: discovered_count = number of repository docs, independent of attachments (agent and skill)', async () => {
    const root = mkCheckout({
      'specs/a.md': '# A',
      'docs/b.md': '# B',
      'insights/c.md': '# C',
      'README.md': 'excluded',
    });
    const repo = await mkRepo(root);
    const agent = await mkAgent();
    const skill = await mkSkill();
    const getAgent = async () =>
      (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` })).json();
    const getSkill = async () =>
      (await app.inject({ method: 'GET', url: `/skills/${skill.id}/context?repo_id=${repo.id}` })).json();

    // No attachments anywhere: the available documents must still be counted.
    const a0 = await getAgent();
    expect(a0.attached).toEqual([]);
    expect(a0.discovered_count).toBe(3);
    const s0 = await getSkill();
    expect(s0.attached).toEqual([]);
    expect(s0.discovered_count).toBe(3);

    // Attaching one document must not change M (not N-1, not attachment-dependent).
    expect((await putAgent(agent.id, repo.id, ['specs/a.md'])).statusCode).toBe(200);
    expect((await putSkill(skill.id, repo.id, ['docs/b.md'])).statusCode).toBe(200);
    const a1 = await getAgent();
    expect(a1.attached).toHaveLength(1);
    expect(a1.discovered_count).toBe(3);
    const s1 = await getSkill();
    expect(s1.attached).toHaveLength(1);
    expect(s1.discovered_count).toBe(3);
  });

  it('AC-13/AC-8: agent state with an unavailable checkout degrades to 200 with discovered_count 0 (no 409)', async () => {
    const repo = await mkRepo(null);
    const agent = await mkAgent();
    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().discovered_count).toBe(0);
    expect(res.json().attached).toEqual([]);
  });

  it('AC-9: too-large file is listed as too_large without tokens and cannot be attached (422)', async () => {
    const root = mkCheckout({ 'specs/ok.md': 'ok', 'specs/huge.md': 'x'.repeat(256 * 1024 + 1) });
    const repo = await mkRepo(root);
    const agent = await mkAgent();

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    const huge = list.docs.find((x: { path: string }) => x.path === 'specs/huge.md');
    expect(huge.too_large).toBe(true);
    expect(huge.tokens).toBeNull();

    const res = await putAgent(agent.id, repo.id, ['specs/huge.md']);
    expect(res.statusCode).toBe(422);
    const state = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` })).json();
    expect(state.attached).toEqual([]);
  });

  it('AC-35/NFR-4a: traversal / absolute / non-doc paths are rejected on attach and on preview', async () => {
    const root = mkCheckout({ 'specs/a.md': 'a' });
    const repo = await mkRepo(root);
    const agent = await mkAgent();
    for (const bad of ['../../etc/passwd', 'docs/../../x.md', '/etc/passwd.md', 'src/a.md', 'specs/a.txt']) {
      const put = await putAgent(agent.id, repo.id, [bad]);
      expect(put.statusCode, bad).toBeGreaterThanOrEqual(400);
      expect(put.statusCode, bad).toBeLessThan(500);
      const get = await app.inject({
        method: 'GET',
        url: `/repos/${repo.id}/context/file?path=${encodeURIComponent(bad)}`,
      });
      expect(get.statusCode, bad).toBeGreaterThanOrEqual(400);
      expect(get.statusCode, bad).toBeLessThan(500);
    }
  });

  it('AC-21: attachments are pinned to the repository they were made for', async () => {
    const files = { 'specs/a.md': 'same path in both repos' };
    const repoX = await mkRepo(mkCheckout(files));
    const repoY = await mkRepo(mkCheckout(files));
    const agent = await mkAgent();

    await putAgent(agent.id, repoX.id, ['specs/a.md']);
    const x = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repoX.id}` })).json();
    const y = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repoY.id}` })).json();
    expect(x.attached.map((r: { path: string }) => r.path)).toEqual(['specs/a.md']);
    expect(y.attached).toEqual([]);
    expect(y.total_tokens).toBe(0);

    const listY = (await app.inject({ method: 'GET', url: `/repos/${repoY.id}/context` })).json();
    expect(listY.docs[0].used_by_agents).toBe(0);
  });

  it('NFR-4e: repo, agent and skill ids from another workspace give 404 (read and write)', async () => {
    const [otherWs] = await db().insert(t.workspaces).values({ name: 'other' }).returning();
    const root = mkCheckout({ 'specs/a.md': 'a' });
    const otherRepo = await mkRepo(root, otherWs!.id);
    const otherAgent = await mkAgent(otherWs!.id);
    const otherSkill = await mkSkill({}, otherWs!.id);
    const myRepo = await mkRepo(root);
    const myAgent = await mkAgent();
    const mySkill = await mkSkill();

    const cases: Array<[string, string, string, unknown?]> = [
      ['GET', `/repos/${otherRepo.id}/context`, 'other repo list'],
      ['POST', `/repos/${otherRepo.id}/context/refresh`, 'other repo refresh'],
      ['GET', `/repos/${otherRepo.id}/context/file?path=specs/a.md`, 'other repo file'],
      ['GET', `/agents/${otherAgent.id}/context?repo_id=${myRepo.id}`, 'other agent get'],
      ['GET', `/agents/${myAgent.id}/context?repo_id=${otherRepo.id}`, 'other repo via agent get'],
      ['GET', `/skills/${otherSkill.id}/context?repo_id=${myRepo.id}`, 'other skill get'],
      ['PUT', `/agents/${otherAgent.id}/context`, 'other agent put', { repo_id: myRepo.id, paths: ['specs/a.md'] }],
      ['PUT', `/agents/${myAgent.id}/context`, 'other repo via agent put', { repo_id: otherRepo.id, paths: ['specs/a.md'] }],
      ['PUT', `/skills/${otherSkill.id}/context`, 'other skill put', { repo_id: myRepo.id, paths: ['specs/a.md'] }],
      ['PUT', `/skills/${mySkill.id}/context`, 'other repo via skill put', { repo_id: otherRepo.id, paths: ['specs/a.md'] }],
    ];
    for (const [method, url, label, payload] of cases) {
      const res = await app.inject({ method: method as 'GET', url, ...(payload ? { payload: payload as object } : {}) });
      expect(res.statusCode, label).toBe(404);
    }
    const leaked = await db().select().from(t.agentContextDocs);
    expect(leaked.some((r) => r.agentId === otherAgent.id)).toBe(false);
  });

  // NFR-1: 500 docs x 20 KB, p95 <= 1000 ms over 20 requests (checkout already synced,
  // token cache warm after a priming request). Timing-based: skip with NFR1_SKIP=1 on a flaky CI.
  const perf = process.env.NFR1_SKIP ? it.skip : it;
  perf('NFR-1: lists 500 x 20 KB documents with p95 <= 1000 ms', async () => {
    const files: Files = {};
    for (let i = 0; i < 500; i++) {
      files[`docs/d${String(i % 5)}/doc-${i}.md`] = `# Doc ${i}\n` + `lorem ipsum ${i} `.repeat(1400);
    }
    const repo = await mkRepo(mkCheckout(files));
    const prime = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(prime.statusCode).toBe(200);
    expect(prime.json().docs).toHaveLength(500);

    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
      times.push(performance.now() - s);
      expect(res.statusCode).toBe(200);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    expect(p95).toBeLessThanOrEqual(1000);
  }, 120_000);
});
