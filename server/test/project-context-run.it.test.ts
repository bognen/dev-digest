import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { renderProjectContext } from '@devdigest/reviewer-core';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * SPEC-01 Project Context - run-level integration. A real review run is driven
 * through POST /pulls/:id/review with a MockLLMProvider (no real LLM) and a real
 * tmpdir checkout; assertions are on the prompt the LLM received, the persisted
 * trace (read with vi.waitFor: it is saved just AFTER the run flips to done) and
 * the logs.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF_ONE = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const DIFF_TWO = `${DIFF_ONE}
diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,3 +1,4 @@
   a: 1,
+  b: 2,
   c: 3,`;

const APPROVE = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

type Files = Record<string, string | Buffer>;
const tmpRoots: string[] = [];
function writeFile(root: string, rel: string, content: string | Buffer): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}
function mkCheckout(files: Files): string {
  const root = mkdtempSync(join(tmpdir(), 'pc-run-'));
  tmpRoots.push(root);
  for (const [rel, content] of Object.entries(files)) writeFile(root, rel, content);
  return root;
}

const HEADING = '## Project context';

d('project context in a live run (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const openApps: Array<{ close: () => Promise<undefined | void> }> = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    for (const a of openApps) await a.close();
    await pg?.stop();
    for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  });

  const db = () => pg.handle.db;

  /** Fresh app + LLM + repo(checkout) + PR + agent per scenario. */
  async function world(opts: { files?: Files; diff?: string; strategy?: 'single-pass' | 'map-reduce' } = {}) {
    const llm = new MockLLMProvider('openai', { structured: APPROVE });
    const app = await buildApp({
      config: config(),
      db: db(),
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: opts.diff ?? DIFF_ONE }),
        llm: { openai: llm },
      },
    });
    openApps.push(app);
    const root = mkCheckout(opts.files ?? {});
    const repo = await mkRepo(root);
    const pr = await mkPr(repo.id);
    const agent = await mkAgent(app, opts.strategy);
    return { app, llm, root, repo, pr, agent };
  }

  async function mkRepo(clonePath: string | null) {
    const n = ++seq;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `pcrun-${n}`, fullName: `acme/pcrun-${n}`, clonePath })
      .returning();
    return repo!;
  }
  async function mkPr(repoId: string) {
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 1,
        title: 'Add key',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'body',
      })
      .returning();
    return pr!;
  }
  async function mkAgent(app: Awaited<ReturnType<typeof buildApp>>, strategy?: 'single-pass' | 'map-reduce') {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Ctx Runner ${++seq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
    });
    const agent = res.json() as { id: string };
    if (strategy) await db().update(t.agents).set({ strategy }).where(eq(t.agents.id, agent.id));
    return agent;
  }
  async function mkSkill(opts: { enabled?: boolean; injectionDetected?: boolean } = {}) {
    const [s] = await db()
      .insert(t.skills)
      .values({
        workspaceId,
        name: `pcrun-skill-${++seq}`,
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'SKILL-BODY',
        enabled: opts.enabled ?? true,
        injectionDetected: opts.injectionDetected ?? false,
      })
      .returning();
    return s!;
  }
  const linkSkill = (agentId: string, skillId: string, order = 0) =>
    db().insert(t.agentSkills).values({ agentId, skillId, order });
  /** Direct DB attach: bypasses API validation so run-time skip paths can be exercised. */
  const attachAgent = (agentId: string, repoId: string, paths: string[]) =>
    db().insert(t.agentContextDocs).values(paths.map((path, order) => ({ agentId, repoId, path, order })));
  const attachSkill = (skillId: string, repoId: string, paths: string[]) =>
    db().insert(t.skillContextDocs).values(paths.map((path, order) => ({ skillId, repoId, path, order })));

  type W = Awaited<ReturnType<typeof world>>;

  /** Trigger a run, wait for done, return run id. */
  async function runOnce(w: W, payload: Record<string, unknown>, expectedRuns = 1): Promise<string[]> {
    const before = (await db().select().from(t.agentRuns).where(eq(t.agentRuns.prId, w.pr.id))).length;
    const res = await w.app.inject({ method: 'POST', url: `/pulls/${w.pr.id}/review`, payload });
    expect(res.statusCode).toBe(200);
    const ids = (res.json().runs as Array<{ run_id: string }>).map((r) => r.run_id);
    await waitForPrRuns(db(), w.pr.id, { expected: before + expectedRuns });
    return ids;
  }
  async function traceOf(w: W, runId: string) {
    return vi.waitFor(
      async () => {
        const body = (await w.app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
        if (!body?.prompt_assembly) throw new Error('trace not persisted yet');
        return body as {
          project_context?: {
            docs: Array<{ path: string; tokens: number; text: string }>;
            skipped: Array<{ path: string; reason: string }>;
            total_tokens: number;
            budget_tokens: number;
          };
          specs_read: string[];
          log: Array<{ msg: string }>;
        };
      },
      { timeout: 8000, interval: 50 },
    );
  }
  const structuredCalls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured');
  const userPrompt = (call: { req: unknown }) => (call.req as { messages: { content: string }[] }).messages[1]!.content;

  it('AC-12/AC-18/AC-17/AC-27/AC-41: own docs then active-skill docs, deduped, full text under "## Project context"; trace records them', async () => {
    const files = {
      'specs/a.md': '# Alpha\nALPHA-FULL-TEXT line two',
      'specs/b.md': '# Bravo\nBRAVO-FULL-TEXT',
      'docs/s.md': 'SKILL-DOC-TEXT',
    };
    const w = await world({ files });
    const skill = await mkSkill();
    await linkSkill(w.agent.id, skill.id);
    // Order B, A (via the API, so AC-12 persistence feeds the run). The skill re-lists A.
    const put = await w.app.inject({
      method: 'PUT',
      url: `/agents/${w.agent.id}/context`,
      payload: { repo_id: w.repo.id, paths: ['specs/b.md', 'specs/a.md'] },
    });
    expect(put.statusCode).toBe(200);
    await w.app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { repo_id: w.repo.id, paths: ['specs/a.md', 'docs/s.md'] },
    });

    const [runId] = await runOnce(w, { agentId: w.agent.id });
    const calls = structuredCalls(w.llm);
    expect(calls).toHaveLength(1);
    const user = userPrompt(calls[0]!);

    expect(user).toContain(HEADING);
    const iB = user.indexOf('<untrusted source="project-doc:specs/b.md">');
    const iA = user.indexOf('<untrusted source="project-doc:specs/a.md">');
    const iS = user.indexOf('<untrusted source="project-doc:docs/s.md">');
    expect(user.indexOf(HEADING)).toBeLessThan(iB);
    expect(iB).toBeGreaterThan(-1);
    expect(iB).toBeLessThan(iA);
    expect(iA).toBeLessThan(iS);
    expect(user.split('project-doc:specs/a.md').length - 1).toBe(1); // AC-17: once
    expect(user).toContain('ALPHA-FULL-TEXT line two'); // full text, untruncated
    expect(user).toContain('BRAVO-FULL-TEXT');
    expect(user).toContain('SKILL-DOC-TEXT');

    const trace = await traceOf(w, runId!);
    expect(trace.specs_read).toEqual(['specs/b.md', 'specs/a.md', 'docs/s.md']); // AC-41
    expect(trace.project_context!.docs.map((x) => x.path)).toEqual(['specs/b.md', 'specs/a.md', 'docs/s.md']);
    expect(trace.project_context!.docs[0]!.text).toBe(files['specs/b.md']); // AC-39 exact text
    expect(trace.project_context!.skipped).toEqual([]);

    // AC-23 at run level: the stored total is the token count of the injected block,
    // which is the same number the Context tab shows for this agent.
    const block = renderProjectContext(trace.project_context!.docs.map((x) => ({ path: x.path, content: x.text })))!;
    expect(user).toContain(block);
    expect(trace.project_context!.total_tokens).toBe(w.app.container.tokenizer.count(block));
    const state = (await w.app.inject({ method: 'GET', url: `/agents/${w.agent.id}/context?repo_id=${w.repo.id}` })).json();
    expect(state.total_tokens).toBe(trace.project_context!.total_tokens);
  });

  it('AC-16: only documents of enabled, non-flagged linked skills are injected (unlinked skills never)', async () => {
    const w = await world({
      files: { 'specs/on.md': 'ON-DOC', 'specs/off.md': 'OFF-DOC', 'specs/bad.md': 'BAD-DOC', 'specs/free.md': 'FREE-DOC' },
    });
    const on = await mkSkill();
    const off = await mkSkill({ enabled: false });
    const bad = await mkSkill({ injectionDetected: true });
    const unlinked = await mkSkill();
    await linkSkill(w.agent.id, on.id, 0);
    await linkSkill(w.agent.id, off.id, 1);
    await linkSkill(w.agent.id, bad.id, 2);
    await attachSkill(on.id, w.repo.id, ['specs/on.md']);
    await attachSkill(off.id, w.repo.id, ['specs/off.md']);
    await attachSkill(bad.id, w.repo.id, ['specs/bad.md']);
    await attachSkill(unlinked.id, w.repo.id, ['specs/free.md']);

    await runOnce(w, { agentId: w.agent.id });
    const user = userPrompt(structuredCalls(w.llm)[0]!);
    expect(user).toContain('ON-DOC');
    for (const absent of ['OFF-DOC', 'BAD-DOC', 'FREE-DOC']) expect(user).not.toContain(absent);
  });

  it('AC-32/NFR-3: no attachments leaves the prompt without a section; with documents the LLM call count is identical', async () => {
    const plain = await world({ files: { 'specs/a.md': 'DOC-TEXT' } });
    const [plainRun] = await runOnce(plain, { agentId: plain.agent.id });
    const plainCalls = structuredCalls(plain.llm);
    expect(userPrompt(plainCalls[0]!)).not.toContain(HEADING);
    expect(userPrompt(plainCalls[0]!)).not.toContain('project-doc:');
    const plainTrace = await traceOf(plain, plainRun!);
    expect(plainTrace.project_context).toBeUndefined();
    expect(plainTrace.specs_read).toEqual([]);

    const withDocs = await world({ files: { 'specs/a.md': 'DOC-TEXT' } });
    await attachAgent(withDocs.agent.id, withDocs.repo.id, ['specs/a.md']);
    await runOnce(withDocs, { agentId: withDocs.agent.id });
    expect(withDocs.llm.calls.length).toBe(plain.llm.calls.length);
    expect(structuredCalls(withDocs.llm)).toHaveLength(plainCalls.length);
    expect(userPrompt(structuredCalls(withDocs.llm)[0]!)).toContain(HEADING);
  });

  it('AC-28: map-reduce run keeps the same document text in every chunk even if the file changes mid-run', async () => {
    const w = await world({ files: { 'specs/a.md': 'ORIGINAL-TEXT' }, diff: DIFF_TWO, strategy: 'map-reduce' });
    await attachAgent(w.agent.id, w.repo.id, ['specs/a.md']);
    const orig = w.llm.completeStructured.bind(w.llm);
    let mutated = false;
    w.llm.completeStructured = (async (req: Parameters<typeof orig>[0]) => {
      if (!mutated) {
        mutated = true;
        writeFile(w.root, 'specs/a.md', 'MUTATED-TEXT');
      }
      return orig(req);
    }) as typeof w.llm.completeStructured;

    await runOnce(w, { agentId: w.agent.id });
    const calls = structuredCalls(w.llm);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) {
      expect(userPrompt(c)).toContain('ORIGINAL-TEXT');
      expect(userPrompt(c)).not.toContain('MUTATED-TEXT');
    }
  });

  it('AC-31: the document is injected for a single run, a run-all and a re-run', async () => {
    const w = await world({ files: { 'specs/a.md': 'EVERY-PATH-DOC' } });
    await attachAgent(w.agent.id, w.repo.id, ['specs/a.md']);
    // run-all fans out to every enabled agent in the workspace; keep only ours enabled.
    await db().update(t.agents).set({ enabled: false }).where(eq(t.agents.workspaceId, workspaceId));
    await db().update(t.agents).set({ enabled: true }).where(eq(t.agents.id, w.agent.id));

    await runOnce(w, { agentId: w.agent.id }); // single
    await runOnce(w, { all: true }); // all
    await runOnce(w, { agentId: w.agent.id }); // re-run
    const calls = structuredCalls(w.llm);
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(userPrompt(c)).toContain('EVERY-PATH-DOC');
  });

  it('AC-33/EC-1/EC-7/AC-36: missing, unreadable, too-large documents are skipped with reasons; blank ones silently; the run still succeeds', async () => {
    const w = await world({
      files: {
        'specs/ok.md': 'OK-DOC-TEXT',
        'specs/binary.md': Buffer.from([0x23, 0x20, 0x00, 0x01, 0x02, 0xff, 0xfe]),
        'specs/latin1.md': Buffer.from([0x63, 0x61, 0x66, 0xe9, 0xc0, 0xff]),
        'specs/huge.md': 'x'.repeat(256 * 1024 + 1),
        'specs/blank.md': '   \n\t\n',
      },
    });
    await attachAgent(w.agent.id, w.repo.id, [
      'specs/ok.md',
      'specs/gone.md',
      'specs/binary.md',
      'specs/latin1.md',
      'specs/huge.md',
      'specs/blank.md',
    ]);

    const [runId] = await runOnce(w, { agentId: w.agent.id });
    const run = (await db().select().from(t.agentRuns).where(eq(t.agentRuns.id, runId!)))[0]!;
    expect(run.status).toBe('done');
    const user = userPrompt(structuredCalls(w.llm)[0]!);
    expect(user).toContain('OK-DOC-TEXT');
    expect(user).not.toContain('project-doc:specs/blank.md');

    const trace = await traceOf(w, runId!);
    const skipped = Object.fromEntries(trace.project_context!.skipped.map((s) => [s.path, s.reason]));
    expect(skipped).toEqual({
      'specs/gone.md': 'missing',
      'specs/binary.md': 'unreadable',
      'specs/latin1.md': 'unreadable',
      'specs/huge.md': 'too_large',
    });
    expect(trace.project_context!.docs.map((x) => x.path)).toEqual(['specs/ok.md']);
  });

  it('AC-34/EC-13: over-budget documents are dropped whole from the end and recorded as over_budget', async () => {
    // Default budget (no known context window for openai) is 16k tokens: one ~9k-token
    // document fits, a second does not.
    const big = (tag: string) => `${tag} ` + 'lorem '.repeat(9000);
    const w = await world({ files: { 'specs/a.md': big('FIRST'), 'specs/b.md': big('SECOND'), 'specs/c.md': 'THIRD-SMALL' } });
    await attachAgent(w.agent.id, w.repo.id, ['specs/a.md', 'specs/b.md', 'specs/c.md']);

    const [runId] = await runOnce(w, { agentId: w.agent.id });
    const trace = await traceOf(w, runId!);
    const pc = trace.project_context!;
    expect(pc.docs.map((x) => x.path)).toEqual(['specs/a.md']);
    expect(pc.skipped).toEqual([
      { path: 'specs/b.md', reason: 'over_budget' },
      { path: 'specs/c.md', reason: 'over_budget' },
    ]);
    expect(pc.total_tokens).toBeLessThanOrEqual(pc.budget_tokens);
    expect(pc.docs[0]!.text).toBe(big('FIRST')); // never truncated
    const user = userPrompt(structuredCalls(w.llm)[0]!);
    expect(user).toContain('FIRST');
    expect(user).not.toContain('SECOND');
    expect(user).not.toContain('THIRD-SMALL');
  });

  it('AC-35/NFR-4a: traversal, absolute and outward-symlink paths are refused and their content never reaches the prompt or trace', async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'pc-outside-'));
    tmpRoots.push(outsideDir);
    writeFileSync(join(outsideDir, 'secret.md'), 'OUTSIDE-SECRET-CONTENT');
    const w = await world({ files: { 'specs/ok.md': 'OK-INSIDE' } });
    const paths = ['specs/ok.md', 'docs/../../../secret.md', join(outsideDir, 'secret.md').replaceAll('\\', '/')];
    let symlinked = false;
    try {
      mkdirSync(join(w.root, 'docs'), { recursive: true });
      symlinkSync(join(outsideDir, 'secret.md'), join(w.root, 'docs/link.md'));
      paths.push('docs/link.md');
      symlinked = true;
    } catch {
      // symlink creation needs privileges on Windows; the other two paths still cover containment
    }
    await attachAgent(w.agent.id, w.repo.id, paths);

    const [runId] = await runOnce(w, { agentId: w.agent.id });
    const trace = await traceOf(w, runId!);
    const reasons = Object.fromEntries(trace.project_context!.skipped.map((s) => [s.path, s.reason]));
    expect(reasons[paths[1]!]).toBe('refused_containment');
    expect(reasons[paths[2]!]).toBe('refused_containment');
    if (symlinked) expect(reasons['docs/link.md']).toBe('refused_containment');
    expect(trace.project_context!.docs.map((x) => x.path)).toEqual(['specs/ok.md']);
    expect(userPrompt(structuredCalls(w.llm)[0]!)).not.toContain('OUTSIDE-SECRET-CONTENT');
    expect(JSON.stringify(trace)).not.toContain('OUTSIDE-SECRET-CONTENT');
  });

  it('AC-21/EC-12: a run for repository Y ignores attachments made for repository X', async () => {
    const w = await world({ files: { 'specs/a.md': 'X-ONLY-DOC' } });
    const otherRoot = mkCheckout({ 'specs/a.md': 'Y-DOC-SAME-PATH' });
    const repoY = await mkRepo(otherRoot);
    const prY = await mkPr(repoY.id);
    await attachAgent(w.agent.id, w.repo.id, ['specs/a.md']); // attached for X only

    const resY = await w.app.inject({ method: 'POST', url: `/pulls/${prY.id}/review`, payload: { agentId: w.agent.id } });
    expect(resY.statusCode).toBe(200);
    await waitForPrRuns(db(), prY.id, { expected: 1 });
    const user = userPrompt(structuredCalls(w.llm)[0]!);
    expect(user).not.toContain(HEADING);
    expect(user).not.toContain('X-ONLY-DOC');
    expect(user).not.toContain('Y-DOC-SAME-PATH');
  });

  it('AC-39/EC-2: the trace keeps the run-time text after the file is modified and after it is deleted', async () => {
    const w = await world({ files: { 'specs/a.md': 'TEXT-AS-OF-RUN' } });
    await attachAgent(w.agent.id, w.repo.id, ['specs/a.md']);
    const [runId] = await runOnce(w, { agentId: w.agent.id });
    await traceOf(w, runId!); // trace persisted

    writeFile(w.root, 'specs/a.md', 'CHANGED-AFTER');
    expect((await traceOf(w, runId!)).project_context!.docs[0]!.text).toBe('TEXT-AS-OF-RUN');
    unlinkSync(join(w.root, 'specs/a.md'));
    const after = await traceOf(w, runId!);
    expect(after.project_context!.docs[0]!.text).toBe('TEXT-AS-OF-RUN');
    expect(after.specs_read).toEqual(['specs/a.md']);
  });

  async function loggedRun(marker: string) {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    const w = await world({ files: { 'specs/a.md': `secret ${marker}`, 'specs/b.md': 'plain' } });
    await attachAgent(w.agent.id, w.repo.id, ['specs/a.md', 'specs/b.md', 'specs/gone.md']);
    const [runId] = await runOnce(w, { agentId: w.agent.id });
    const trace = await traceOf(w, runId!);
    const calls = spies.flatMap((s) => s.mock.calls);
    return { w, trace, calls };
  }

  it('NFR-5: document content never reaches server logs or the run log (only paths/counts/tokens)', async () => {
    const MARKER = 'UNIQUE-PROPRIETARY-MARKER-7f3a91';
    const { w, trace, calls } = await loggedRun(MARKER);
    // The marker IS in the prompt (that is the feature) but nowhere in logs.
    expect(userPrompt(structuredCalls(w.llm)[0]!)).toContain(MARKER);
    expect(calls.map((args) => JSON.stringify(args)).some((l) => l.includes(MARKER))).toBe(false);
    expect(JSON.stringify(trace.log)).not.toContain(MARKER);
  });

  it('NFR-6: the attached/added/skipped/dropped counters and total tokens are logged as numbers', async () => {
    const { trace, calls } = await loggedRun('NFR6-MARKER');
    const resolved = calls
      .map((args) => args[0] as Record<string, unknown>)
      .find((o) => o && typeof o === 'object' && o.event === 'project_context.resolved');
    expect(resolved).toBeDefined();
    expect(resolved!.totalTokens).toBe(trace.project_context!.total_tokens);
    // 3 attached (one missing), nothing from skills, nothing dropped.
    expect(resolved!.attached).toBe(3);
    expect(resolved!.added).toBe(0);
    expect(resolved!.skipped).toBe(1);
    expect(resolved!.dropped).toBe(0);
  });
});
