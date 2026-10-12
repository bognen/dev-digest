import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider } from '@devdigest/shared';
import { BriefService, type BriefLogger } from '../src/modules/brief/service.js';
import type { BriefRepository, BriefPullRow, BriefPrFileRow, BriefRow } from '../src/modules/brief/repository.js';
import type { RepoIntelPort, Tokenizer } from '../src/modules/brief/ports.js';
import { fakeTokenizer, rawOutput } from './helpers/brief-fixtures.js';

const WS = 'ws-1';
const PR = 'pr-1';
const MARKERS = ['WHAT-MARK', 'WHY-MARK', 'SUMMARY-MARK', 'ISSUE-BODY-MARK', 'SPEC-CONTENT-MARK'];

const pullRow = (over: Partial<BriefPullRow> = {}): BriefPullRow => ({
  id: PR,
  repoId: 'repo-1',
  number: 7,
  title: 'Add thing',
  body: 'Does a thing.',
  headSha: 'sha-head-1',
  base: 'main',
  additions: 3,
  deletions: 1,
  filesCount: 1,
  intentSummary: null,
  intentInScope: null,
  intentOutOfScope: null,
  intentContextGaps: null,
  intentSignals: null,
  intentResolvedAt: null,
  ...over,
});

const fileRows: BriefPrFileRow[] = [
  { path: 'src/a.ts', additions: 3, deletions: 1, patch: '@@ -1,2 +1,4 @@\n+secret hunk body\n' },
];

interface Harness {
  service: BriefService;
  llmCalls: Array<{ model: string; messages: Array<{ role: string; content: string }> }>;
  completeStructured: ReturnType<typeof vi.fn>;
  upserts: Array<{ json: Record<string, unknown> }>;
  info: Array<{ obj: Record<string, unknown>; msg?: string }>;
  warn: Array<{ obj: Record<string, unknown>; msg?: string }>;
  resolveModel: ReturnType<typeof vi.fn>;
  repo: Record<string, ReturnType<typeof vi.fn>>;
}

function build(opts: {
  pull?: BriefPullRow | undefined;
  files?: BriefPrFileRow[];
  stored?: BriefRow | undefined;
  indexStatus?: string;
  tokenizer?: Tokenizer;
  completeStructured?: (req: { model: string; messages: Array<{ role: string; content: string }> }) => Promise<unknown>;
  issueBody?: string | null; // when set, github.getIssue resolves
  specContent?: string | null;
  resolvedModel?: { provider: string; model: string };
} = {}): Harness {
  const pull = 'pull' in opts ? opts.pull : pullRow();
  const llmCalls: Harness['llmCalls'] = [];
  const upserts: Harness['upserts'] = [];
  const info: Harness['info'] = [];
  const warn: Harness['warn'] = [];

  const completeStructured = vi.fn(async (req: { model: string; messages: Array<{ role: string; content: string }> }) => {
    llmCalls.push({ model: req.model, messages: req.messages });
    if (opts.completeStructured) return opts.completeStructured(req);
    return {
      data: rawOutput({ what: 'WHAT-MARK.', why: 'WHY-MARK.', summary: 'SUMMARY-MARK.' }),
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.01,
      raw: '{}',
      attempts: 2,
    };
  });
  const provider = { id: 'openai', completeStructured } as unknown as LLMProvider;

  const repo = {
    getPull: vi.fn(async (ws: string, id: string) => (ws === WS && id === PR ? pull : undefined)),
    getPrFiles: vi.fn(async () => opts.files ?? fileRows),
    getBrief: vi.fn(async () => opts.stored),
    getRepo: vi.fn(async () => ({ id: 'repo-1', owner: 'o', name: 'n', fullName: 'o/n', clonePath: '/tmp/clone' })),
    upsertBrief: vi.fn(async (input: { json: Record<string, unknown> }) => {
      upserts.push(input);
    }),
  };

  const repoIntel: RepoIntelPort = {
    getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [] }),
    getIndexState: async () => ({
      status: opts.indexStatus ?? 'degraded',
      lastIndexedSha: 'idx1',
      indexerVersion: 1,
      updatedAt: new Date(),
    }),
  };

  const resolveModel = vi.fn(async () => opts.resolvedModel ?? { provider: 'openai', model: 'model-a' });
  const logger: BriefLogger = {
    info: (obj, msg) => void info.push({ obj: obj as Record<string, unknown>, msg }),
    warn: (obj, msg) => void warn.push({ obj: obj as Record<string, unknown>, msg }),
  };

  const service = new BriefService(
    repo as unknown as BriefRepository,
    repoIntel,
    resolveModel as never,
    (async () => provider) as never,
    (async () => ({
      getIssue: async () => ({ number: 12, title: 'Issue', body: opts.issueBody ?? 'ISSUE-BODY-MARK' }),
    })) as never,
    async () => opts.specContent ?? null,
    opts.tokenizer ?? fakeTokenizer,
    () => 0.5,
    logger,
  );
  return { service, llmCalls, completeStructured, upserts, info, warn, resolveModel, repo: repo as never };
}

const storedRow = (over: Partial<BriefRow> = {}): BriefRow => ({
  prId: PR,
  json: { what: 'old', why: 'old', risk_level: 'low', risks: [], review_focus: [] },
  generatedAt: new Date('2026-01-01T00:00:00Z'),
  headSha: 'sha-head-1',
  indexSha: 'idx1',
  indexStatus: 'degraded',
  indexerVersion: 1,
  intentResolvedAt: null,
  provider: 'openai',
  model: 'model-a',
  attempts: 1,
  tokensIn: 1,
  tokensOut: 1,
  costUsd: 0,
  droppedInputs: 0,
  ...over,
});

describe('BriefService.generate (SPEC-04)', () => {
  it('AC-15/EC-9/NFR-3: one completeStructured call, one prose-free brief.generate line with the required fields', async () => {
    const h = build();
    const res = await h.service.generate(WS, PR, false);

    expect(res.status).toBe('generated');
    expect(h.completeStructured).toHaveBeenCalledTimes(1);

    const lines = h.info.filter((l) => l.msg === 'brief.generate');
    expect(lines).toHaveLength(1);
    const o = lines[0]!.obj;
    expect(o).toMatchObject({
      prId: PR,
      provider: 'openai',
      model: 'model-a',
      ok: true,
      attempts: 2,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.01,
    });
    expect(Object.keys(o.dropped as object).sort()).toEqual(['citations', 'focus', 'lines', 'links', 'paths', 'risks']);
    const serialized = JSON.stringify(lines[0]);
    for (const m of MARKERS) expect(serialized).not.toContain(m);
    expect(serialized).not.toContain('secret hunk body');
  });

  it('AC-14: resolves the model via (workspaceId, risk_brief) on every generation and uses it', async () => {
    const h = build();
    const first = await h.service.generate(WS, PR, true);
    expect(h.resolveModel).toHaveBeenCalledWith(WS, 'risk_brief');
    expect(h.llmCalls[0]!.model).toBe('model-a');
    expect(first.provenance).toMatchObject({ model: 'model-a', provider: 'openai' });

    h.resolveModel.mockResolvedValueOnce({ provider: 'openai', model: 'model-b' });
    const second = await h.service.generate(WS, PR, true);
    expect(h.llmCalls[1]!.model).toBe('model-b');
    expect(second.provenance?.model).toBe('model-b');
  });

  it('AC-16: 0 model calls for cache hit, no-files refusal, getPage, and a concurrent in-flight request', async () => {
    // cache hit (same head SHA, regenerate false)
    const cached = build({ stored: storedRow() });
    const hit = await cached.service.generate(WS, PR, false);
    expect(hit.brief?.what).toBe('old'); // the stored brief, not a fresh one
    expect(cached.completeStructured).not.toHaveBeenCalled();

    // PR with no changed files -> refused
    const empty = build({ files: [] });
    const refused = await empty.service.generate(WS, PR, true);
    expect(refused.status).toBe('refused');
    expect(empty.completeStructured).not.toHaveBeenCalled();

    // getPage never calls the model
    const page = build({ stored: storedRow() });
    await page.service.getPage(WS, PR);
    expect(page.completeStructured).not.toHaveBeenCalled();

    // concurrent: deferred promise in the fake LLM (no Promise.all race)
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started!: () => void;
    const startedP = new Promise<void>((r) => (started = r));
    const slow = build({
      completeStructured: async (req) => {
        started();
        await gate;
        return { data: rawOutput(), model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '{}', attempts: 1 };
      },
    });
    const first = slow.service.generate(WS, PR, true);
    await startedP;
    const second = await slow.service.generate(WS, PR, true);
    expect(second.status).toBe('generating');
    expect(slow.completeStructured).toHaveBeenCalledTimes(1);
    release();
    expect((await first).status).toBe('generated');
    expect(slow.completeStructured).toHaveBeenCalledTimes(1);
  });

  it('AC-12/EC-8: all inputs missing -> four names in returned and persisted brief', async () => {
    const h = build(); // no intent, no issue/spec ref in body, index degraded
    const res = await h.service.generate(WS, PR, true);
    const expected = ['intent', 'blast_radius', 'linked_issue', 'specs'];
    expect(res.brief?.missing_inputs).toEqual(expected);
    expect(h.upserts[0]!.json.missing_inputs).toEqual(expected);
  });

  it('AC-13: all four inputs available -> missing_inputs is []', async () => {
    const h = build({
      pull: pullRow({
        body: 'Fixes #12, see specs/01-x.md',
        intentSummary: 'intent',
        intentResolvedAt: new Date('2026-01-02T00:00:00Z'),
      }),
      indexStatus: 'full',
      specContent: 'SPEC-CONTENT-MARK body',
    });
    const res = await h.service.generate(WS, PR, true);
    expect(res.brief?.missing_inputs).toEqual([]);
    expect(h.upserts[0]!.json.missing_inputs).toEqual([]);
  });

  it('AC-19: over-budget input still calls the model once and logs one prose-free warn with tokens and budget', async () => {
    const h = build({ tokenizer: { count: () => 9000 } });
    const res = await h.service.generate(WS, PR, true);
    expect(res.status).toBe('generated');
    expect(h.completeStructured).toHaveBeenCalledTimes(1);
    expect(h.warn).toHaveLength(1);
    expect(h.warn[0]!.msg).toBe('brief.input_over_budget');
    expect(h.warn[0]!.obj).toMatchObject({ prId: PR, provider: 'openai', model: 'model-a', tokens: 9000, budget: 8000 });
    const serialized = JSON.stringify(h.warn[0]);
    for (const m of MARKERS) expect(serialized).not.toContain(m);
  });

  it('AC-19: in-budget input logs no warning', async () => {
    const h = build();
    await h.service.generate(WS, PR, true);
    expect(h.warn).toHaveLength(0);
  });

  it('NFR-3: a model failure returns failed, logs one brief.generate ok:false line, persists nothing', async () => {
    const h = build({
      pull: pullRow({ body: 'Fixes #12' }),
      completeStructured: async () => {
        throw new Error('provider exploded');
      },
    });
    const res = await h.service.generate(WS, PR, true);
    expect(res.status).toBe('failed');
    expect(h.upserts).toHaveLength(0);
    const lines = h.info.filter((l) => l.msg === 'brief.generate');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.obj).toMatchObject({ ok: false, provider: 'openai', model: 'model-a', prId: PR });
    const serialized = JSON.stringify(lines[0]);
    expect(serialized).not.toContain('ISSUE-BODY-MARK');
    expect(serialized).not.toContain('SPEC-CONTENT-MARK');
  });
});
