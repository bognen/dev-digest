import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { INJECTION_GUARD } from '@devdigest/reviewer-core';
import { BriefGenerateResult, BriefPage } from '@devdigest/shared';
import type { IssueMeta, RepoRef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitHubClient, type MockLLMOptions } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * SPEC-04 PR Brief contract gaps - integration (plan step 9). Cases come from the
 * spec's ACs/NFRs and their `Verify:` hints, driven through the real routes
 * (GET /pulls/:id/brief, POST /pulls/:id/brief, POST /pulls/:id/brief/generate)
 * against Testcontainers Postgres, the REAL repo-intel facade (seeded
 * `repo_index_state` only where a case needs the index "available"), a
 * MockLLMProvider and a MockGitHubClient. Never a real LLM or GitHub.
 *
 * Body note: "absent body" is exercised by injecting with NO payload and NO
 * content-type header. Fastify answers 400 to a JSON content-type with an empty
 * body, so that combination is deliberately not sent.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const LOG_MSG = 'brief.generate';
const PATCH = '@@ -1,2 +1,3 @@\n a\n+b\n c';
const FILE = 'src/a.ts';
const ALL_FOUR = ['intent', 'blast_radius', 'linked_issue', 'specs'];

const PR_MARK = 'PR-BODY-MARKER-3d41';
const ISSUE_MARK = 'ISSUE-BODY-MARKER-8a02';
const SPEC_MARK = 'SPEC-CONTENT-MARKER-6c77';
const PROSE_MARK = 'BRIEF-PROSE-MARKER-91ef';

/** Issue source whose body carries a marker (the stock mock returns 'mock issue'). */
class MarkerGithub extends MockGitHubClient {
  override async getIssue(_repo: RepoRef, n: number): Promise<IssueMeta> {
    return { number: n, title: `Issue #${n}`, body: ISSUE_MARK, state: 'open' };
  }
}

const tmpRoots: string[] = [];
function mkCheckout(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'brief-'));
  tmpRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const sentences = (s: string) => s.split(/[.!?]+(?:\s|$)/).filter((x) => x.trim().length > 0).length;

d('PR brief (Testcontainers pg)', () => {
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

  // ---------------------------------------------------------------- fixtures

  interface PrOpts {
    workspace?: string;
    body?: string | null;
    clonePath?: string | null;
    /** false = a PR with no changed files (refused path). */
    files?: boolean;
    intent?: boolean;
    index?: 'full';
  }

  async function mkPr(o: PrOpts = {}) {
    const n = ++seq;
    const [repo] = await db()
      .insert(t.repos)
      .values({
        workspaceId: o.workspace ?? workspaceId,
        owner: 'acme',
        name: `brief-${n}`,
        fullName: `acme/brief-${n}`,
        clonePath: o.clonePath ?? null,
      })
      .returning();
    const headSha = `${String(n).padStart(2, '0')}abc1234def5678abc1234def5678abc1234de`.slice(0, 40);
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId: o.workspace ?? workspaceId,
        repoId: repo!.id,
        number: n,
        title: `PR ${n}`,
        author: 'dev',
        branch: 'feat',
        base: 'main',
        headSha,
        additions: 1,
        deletions: 0,
        filesCount: 1,
        body: o.body === undefined ? 'Plain description, no references.' : o.body,
      })
      .returning();
    if (o.files !== false) {
      await db().insert(t.prFiles).values({ prId: pr!.id, path: FILE, additions: 1, deletions: 0, patch: PATCH });
    }
    if (o.intent) {
      await db().insert(t.prIntent).values({ prId: pr!.id, intent: 'Add b to a.ts.', headSha });
    }
    if (o.index === 'full') {
      await db()
        .insert(t.repoIndexState)
        .values({
          repoId: repo!.id,
          lastIndexedSha: headSha,
          indexerVersion: 2,
          status: 'full',
          filesIndexed: 3,
          filesSkipped: 0,
        });
    }
    return { id: pr!.id, repoId: repo!.id, headSha, workspaceId: o.workspace ?? workspaceId };
  }

  /** The `risk_brief` workspace setting (replace-in-place; userId NULL = workspace level). */
  async function setRiskBriefModel(model: string, provider = 'openai') {
    await db()
      .delete(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models'), isNull(t.settings.userId)));
    await db()
      .insert(t.settings)
      .values({ workspaceId, key: 'feature_models', value: { risk_brief: { provider, model } } });
  }

  interface AppOpts {
    llm?: MockLLMOptions;
    github?: MockGitHubClient;
  }
  /** Fresh app (= fresh container + fresh BriefService singleton) over the SAME db. */
  async function mkApp(o: AppOpts = {}) {
    const bySchema: Record<string, unknown> = { ...(o.llm?.structuredBySchema ?? {}) };
    const llm = new MockLLMProvider('openai', { ...o.llm, structuredBySchema: bySchema });
    const app = await buildApp({
      config: config(),
      db: db(),
      overrides: {
        github: o.github ?? new MockGitHubClient(),
        llm: { openrouter: llm, openai: llm, anthropic: llm },
      },
    });
    openApps.push(app);
    bySchema.BriefGenerationOutput = goodOutput();
    return { app, llm, bySchema };
  }
  type TheApp = Awaited<ReturnType<typeof mkApp>>;

  /** A schema-valid, groundable model answer (file + line in the hunk; no backticks). */
  function goodOutput(over: Record<string, unknown> = {}) {
    return {
      what: 'Adds line b to a.ts.',
      why: 'The module needed it.',
      summary: 'This PR adds line b to a.ts. The module needed it. Nothing else changes.',
      risk_level: 'low',
      risks: [
        {
          kind: 'logic',
          title: 'Edge case in b',
          explanation: 'Line b may not handle empty input.',
          severity: 'low',
          file_refs: [{ file: FILE, line: 2 }],
        },
      ],
      review_focus: [{ file: FILE, line: 2, reason: 'New logic.' }],
      ...over,
    };
  }

  const structuredCalls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured');
  const messagesOf = (call: { req: unknown }) =>
    (call.req as { messages: { role: string; content: string }[] }).messages;

  const CANON = (id: string) => `/pulls/${id}/brief`;
  const ALIAS = (id: string) => `/pulls/${id}/brief/generate`;

  const get = (a: TheApp, id: string) => a.app.inject({ method: 'GET', url: CANON(id) });
  /** `payload` omitted => NO body and NO content-type header (the absent-body case). */
  const post = (a: TheApp, url: string, payload?: Record<string, unknown>) =>
    a.app.inject(payload === undefined ? { method: 'POST', url } : { method: 'POST', url, payload });

  const briefRow = async (id: string) =>
    (await db().select().from(t.prBrief).where(eq(t.prBrief.prId, id)))[0];

  /** console.info/warn spies; records() are the `brief.generate` objects. */
  function captureLogs() {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    return {
      all: () => spies.flatMap((s) => s.mock.calls as unknown[][]),
      records: () =>
        (spies[1]!.mock.calls as unknown[][]).filter((c) => c[1] === LOG_MSG).map((c) => c[0] as Record<string, unknown>),
    };
  }

  // ------------------------------------------------------------------- tests

  it('AC-1: a generation stores and returns a non-empty summary of at most 3 sentences; a re-read returns the same summary', async () => {
    const pr = await mkPr();
    const a = await mkApp();

    const res = await post(a, CANON(pr.id), {});
    expect(res.statusCode).toBe(200);
    const result = BriefGenerateResult.parse(res.json());
    expect(result.status).toBe('generated');
    const summary = result.brief!.summary!;
    expect(summary.trim().length).toBeGreaterThan(0);
    expect(sentences(summary)).toBeLessThanOrEqual(3);
    // what/why stay alongside the new summary
    expect(result.brief!.what).toBe('Adds line b to a.ts.');
    expect(result.brief!.why).toBe('The module needed it.');
    expect(structuredCalls(a.llm)).toHaveLength(1);

    const page = BriefPage.parse((await get(a, pr.id)).json());
    expect(page.brief!.summary).toBe(summary);
    expect(((await briefRow(pr.id))!.json as { summary?: string }).summary).toBe(summary);
  });

  it('AC-3/NFR-2/EC-1: a brief stored before this change (what/why only) is read as a valid 200 page with no summary or missing_inputs, on GET and on both POST paths', async () => {
    const pr = await mkPr();
    const legacy = { what: 'Legacy what.', why: 'Legacy why.', risk_level: 'low', risks: [], review_focus: [] };
    await db().insert(t.prBrief).values({ prId: pr.id, json: legacy, headSha: pr.headSha, model: 'gpt-4.1' });
    const a = await mkApp();

    const res = await get(a, pr.id);
    expect(res.statusCode).toBe(200);
    const page = BriefPage.parse(res.json());
    expect(page.brief!.what).toBe('Legacy what.');
    expect(page.brief!.summary).toBeUndefined();
    expect(page.brief!.missing_inputs).toBeUndefined();

    for (const url of [CANON(pr.id), ALIAS(pr.id)]) {
      const r = await post(a, url, {});
      expect(r.statusCode, url).toBe(200);
      const parsed = BriefGenerateResult.parse(r.json());
      expect(parsed.brief!.summary, url).toBeUndefined();
      expect(parsed.brief!.missing_inputs, url).toBeUndefined();
    }
    expect(a.llm.calls).toHaveLength(0); // cache hit: legacy rows are served, not regenerated
  });

  it('AC-7/NFR-4c: the canonical path accepts {}, {regenerate:true} and NO body at all, runs the same flow, and 404s a PR of another workspace', async () => {
    const a = await mkApp();

    // {} on a fresh PR generates; a cache hit follows; {regenerate:true} forces a second call
    const pr = await mkPr();
    const first = BriefGenerateResult.parse((await post(a, CANON(pr.id), {})).json());
    expect(first.status).toBe('generated');
    expect(structuredCalls(a.llm)).toHaveLength(1);

    const regen = await post(a, CANON(pr.id), { regenerate: true });
    expect(regen.statusCode).toBe(200);
    expect(BriefGenerateResult.parse(regen.json()).status).toBe('generated');
    expect(structuredCalls(a.llm)).toHaveLength(2);

    // absent body (no payload, no content-type) on a fresh PR: generated, one more call
    const bare = await mkPr();
    const res = await post(a, CANON(bare.id));
    expect(res.statusCode).toBe(200);
    const parsed = BriefGenerateResult.parse(res.json());
    expect(parsed.status).toBe('generated');
    expect(parsed.brief!.summary).toBeTruthy();
    expect(structuredCalls(a.llm)).toHaveLength(3);

    // cross-workspace: 404 on every path, nothing sent to the model, nothing stored
    const [other] = await db().insert(t.workspaces).values({ name: `other-${++seq}` }).returning();
    const foreign = await mkPr({ workspace: other!.id });
    const before = a.llm.calls.length;
    expect((await post(a, CANON(foreign.id), {})).statusCode).toBe(404);
    expect((await post(a, CANON(foreign.id))).statusCode).toBe(404);
    expect((await post(a, ALIAS(foreign.id), {})).statusCode).toBe(404);
    expect((await post(a, ALIAS(foreign.id))).statusCode).toBe(404);
    expect((await get(a, foreign.id)).statusCode).toBe(404);
    expect(a.llm.calls).toHaveLength(before);
    expect(await briefRow(foreign.id)).toBeUndefined();
  });

  it('AC-8/NFR-2/EC-3: the alias returns the same shape as the canonical path, with {}, {regenerate:true} and an absent body', async () => {
    const a = await mkApp();
    const pr = await mkPr();

    const viaAlias = await post(a, ALIAS(pr.id), {});
    expect(viaAlias.statusCode).toBe(200);
    const g = BriefGenerateResult.parse(viaAlias.json());
    expect(g.status).toBe('generated');
    expect(g.brief!.summary).toBeTruthy();
    expect(g.provenance!.model).toEqual(expect.any(String));

    expect(BriefGenerateResult.parse((await post(a, ALIAS(pr.id), { regenerate: true })).json()).status).toBe('generated');
    expect(structuredCalls(a.llm)).toHaveLength(2);

    const bare = await mkPr();
    const res = await post(a, ALIAS(bare.id));
    expect(res.statusCode).toBe(200);
    expect(BriefGenerateResult.parse(res.json()).status).toBe('generated');
    expect(structuredCalls(a.llm)).toHaveLength(3);

    // same keys as the canonical path for an equivalent generation
    const canonPr = await mkPr();
    const canon = BriefGenerateResult.parse((await post(a, CANON(canonPr.id), {})).json());
    expect(Object.keys(canon).sort()).toEqual(Object.keys(g).sort());
    expect(Object.keys(canon.brief!).sort()).toEqual(Object.keys(g.brief!).sort());
  });

  it.each([
    ['alias first, then canonical', ALIAS, CANON],
    ['canonical first, then alias', CANON, ALIAS],
  ] as const)(
    'AC-8/EC-7: concurrent POSTs on the two paths for one PR cause one generation (%s)',
    async (_name, firstPath, secondPath) => {
      const pr = await mkPr();
      const a = await mkApp({ llm: { structuredDelayMs: 600 } });

      const first = post(a, firstPath(pr.id), {});
      // the call is recorded BEFORE the delay, so this proves generation is in flight
      await vi.waitFor(() => expect(structuredCalls(a.llm)).toHaveLength(1), { timeout: 5000, interval: 10 });

      const second = await post(a, secondPath(pr.id), {});
      expect(second.statusCode).toBe(200);
      expect(BriefGenerateResult.parse(second.json()).status).toBe('generating');

      const done = BriefGenerateResult.parse((await first).json());
      expect(done.status).toBe('generated');
      expect(structuredCalls(a.llm)).toHaveLength(1); // exactly one model call across both paths

      // the guard is released afterwards (a cache hit now, still no new call)
      expect(BriefGenerateResult.parse((await post(a, secondPath(pr.id), {})).json()).status).not.toBe('generating');
      expect(structuredCalls(a.llm)).toHaveLength(1);
    },
  );

  it('AC-12/EC-8: with no intent, no linked issue, no spec and no index, missing_inputs names all four (server-computed) and a re-read returns the same list', async () => {
    const pr = await mkPr({ body: 'Plain description, no references.' });
    const a = await mkApp();

    const res = BriefGenerateResult.parse((await post(a, CANON(pr.id), {})).json());
    expect(res.status).toBe('generated');
    expect(res.brief!.missing_inputs).toEqual(ALL_FOUR);

    const page = BriefPage.parse((await get(a, pr.id)).json());
    expect(page.brief!.missing_inputs).toEqual(ALL_FOUR);
    expect((await briefRow(pr.id))!.json).toMatchObject({ missing_inputs: ALL_FOUR });
  });

  it('AC-13/NFR-4a: with intent, a linked issue, a readable spec and a built index, missing_inputs is [] and PR/issue/spec text reaches the model only inside untrusted blocks', async () => {
    // Fixture: a real tmpdir checkout holds the referenced spec; clone_path points at it.
    // The index is "available" via a seeded repo_index_state row (status full, files_indexed > 0).
    const root = mkCheckout({ 'specs/01-feature.md': `# Spec\n${SPEC_MARK}\n` });
    const pr = await mkPr({
      body: `Closes #12. See specs/01-feature.md. ${PR_MARK}`,
      clonePath: root,
      intent: true,
      index: 'full',
    });
    const a = await mkApp({ github: new MarkerGithub() });

    const res = BriefGenerateResult.parse((await post(a, CANON(pr.id), {})).json());
    expect(res.status).toBe('generated');
    expect(res.brief!.missing_inputs).toEqual([]);
    expect(BriefPage.parse((await get(a, pr.id)).json()).brief!.missing_inputs).toEqual([]);

    const calls = structuredCalls(a.llm);
    expect(calls).toHaveLength(1);
    const msgs = messagesOf(calls[0]!);
    const system = msgs.find((m) => m.role === 'system')!.content;
    const user = msgs.find((m) => m.role === 'user')!.content;
    expect(system).toContain(INJECTION_GUARD);
    for (const mark of [PR_MARK, ISSUE_MARK, SPEC_MARK]) {
      expect(user, mark).toContain(mark); // the data is in the prompt (that is the feature)...
      const outside = user.replace(/<untrusted source="[^"]*">[\s\S]*?\n<\/untrusted>/g, '');
      expect(outside, mark).not.toContain(mark); // ...but only wrapped as untrusted data
      expect(system, mark).not.toContain(mark);
    }
  });

  it('AC-14: the model comes from the workspace risk_brief setting, and a changed setting is used by the next generation', async () => {
    const pr = await mkPr();
    const a = await mkApp();

    await setRiskBriefModel('brief-model-a');
    const first = BriefGenerateResult.parse((await post(a, CANON(pr.id), {})).json());
    expect(first.provenance!.model).toBe('brief-model-a');
    expect(first.provenance!.provider).toBe('openai');
    expect((structuredCalls(a.llm)[0]!.req as { model: string }).model).toBe('brief-model-a');
    expect((await briefRow(pr.id))!.model).toBe('brief-model-a');

    await setRiskBriefModel('brief-model-b');
    const second = BriefGenerateResult.parse((await post(a, ALIAS(pr.id), { regenerate: true })).json());
    expect(second.provenance!.model).toBe('brief-model-b');
    const calls = structuredCalls(a.llm);
    expect(calls).toHaveLength(2);
    expect((calls[1]!.req as { model: string }).model).toBe('brief-model-b');
  });

  it('AC-16: GET, a cache-hit POST, a PR with no changed files and a concurrent request all make 0 model calls', async () => {
    const pr = await mkPr();
    const a = await mkApp({ llm: { structuredDelayMs: 500 } });

    // GET before anything is generated
    expect(BriefPage.parse((await get(a, pr.id)).json()).status).toBe('none');
    expect(a.llm.calls).toHaveLength(0);

    // one real generation, then a GET and a cache-hit POST on each path add no calls
    const gen = post(a, CANON(pr.id), {});
    await vi.waitFor(() => expect(structuredCalls(a.llm)).toHaveLength(1), { timeout: 5000, interval: 10 });
    // concurrent GET while in flight reports `generating`, no call
    expect(BriefPage.parse((await get(a, pr.id)).json()).status).toBe('generating');
    await gen;
    expect(structuredCalls(a.llm)).toHaveLength(1);

    expect(BriefPage.parse((await get(a, pr.id)).json()).brief).not.toBeNull();
    for (const url of [CANON(pr.id), ALIAS(pr.id)]) {
      const hit = BriefGenerateResult.parse((await post(a, url, {})).json());
      expect(hit.status, url).not.toBe('generating');
    }
    expect(a.llm.calls).toHaveLength(1);

    // a PR with no changed files is refused with no call
    const empty = await mkPr({ files: false });
    const refused = BriefGenerateResult.parse((await post(a, CANON(empty.id), {})).json());
    expect(refused.status).toBe('refused');
    expect(a.llm.calls).toHaveLength(1);
    expect(await briefRow(empty.id)).toBeUndefined();
  });

  it('NFR-3/AC-15: a success run and a model-failure run each emit one brief.generate object (ok, provider, model, prId); no issue/spec/PR/brief prose is logged', async () => {
    const root = mkCheckout({ 'specs/02-other.md': `# Spec\n${SPEC_MARK}\n` });

    // success
    const okPr = await mkPr({ body: `Closes #3. specs/02-other.md ${PR_MARK}`, clonePath: root });
    const okLogs = captureLogs();
    const okApp = await mkApp({
      github: new MarkerGithub(),
      llm: { structuredBySchema: { BriefGenerationOutput: goodOutput({ what: PROSE_MARK }) } },
    });
    okApp.bySchema.BriefGenerationOutput = goodOutput({ what: PROSE_MARK });
    await setRiskBriefModel('log-model');
    expect(BriefGenerateResult.parse((await post(okApp, CANON(okPr.id), {})).json()).status).toBe('generated');
    const okRecs = okLogs.records();
    expect(okRecs).toHaveLength(1);
    expect(okRecs[0]).toMatchObject({ ok: true, provider: 'openai', model: 'log-model', prId: okPr.id });
    expect(structuredCalls(okApp.llm)).toHaveLength(1);
    const okText = okLogs.all().map((args) => JSON.stringify(args)).join('\n');
    for (const mark of [PR_MARK, ISSUE_MARK, SPEC_MARK, PROSE_MARK, 'Adds line b']) expect(okText, mark).not.toContain(mark);
    vi.restoreAllMocks();

    // model failure
    const badPr = await mkPr({ body: `Closes #4. specs/02-other.md ${PR_MARK}`, clonePath: root });
    const badLogs = captureLogs();
    const badApp = await mkApp({
      github: new MarkerGithub(),
      llm: { throwOnStructured: new Error('upstream exploded') },
    });
    const failed = BriefGenerateResult.parse((await post(badApp, CANON(badPr.id), {})).json());
    expect(failed.status).toBe('failed');
    expect(structuredCalls(badApp.llm)).toHaveLength(1);
    const badRecs = badLogs.records();
    expect(badRecs).toHaveLength(1);
    expect(badRecs[0]).toMatchObject({ ok: false, provider: 'openai', model: 'log-model', prId: badPr.id });
    const badText = badLogs.all().map((args) => JSON.stringify(args)).join('\n');
    for (const mark of [PR_MARK, ISSUE_MARK, SPEC_MARK]) expect(badText, mark).not.toContain(mark);
    expect(await briefRow(badPr.id)).toBeUndefined(); // nothing stored on failure
  });
});
