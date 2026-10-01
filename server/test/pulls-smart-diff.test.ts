/**
 * Smart Diff (`modules/pulls`): path classifier, grouping, split suggestion and
 * the service's latest-per-agent anchoring. Pure helpers + a hand-rolled fake
 * PullsRepo port — no DB, no GitHub, no Docker.
 *
 * Classification: first match wins, order boilerplate > tests > wiring > docs >
 * core. Directory rules match any path segment; basename globs are
 * case-insensitive. GitHub paths always use '/', so backslash input is not
 * a supported case.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import {
  classifyPath,
  buildSmartDiff,
  buildSplitSuggestion,
  openFindingLinesByPath,
} from '../src/modules/pulls/helpers.js';
import { SMART_DIFF_ROLE_ORDER, SPLIT_SUGGESTION_MAX_LINES } from '../src/modules/pulls/constants.js';
import { PullsService } from '../src/modules/pulls/service.js';
import { NotFoundError } from '../src/platform/errors.js';
import type {
  PullsRepo,
  PullRecord,
  RepoRef,
  PrFileStat,
  FindingAnchorRow,
  ReviewRollupRow,
} from '../src/modules/pulls/types.js';

describe('classifyPath', () => {
  const cases: [string, SmartDiffRole][] = [
    // boilerplate
    ['src/__tests__/__snapshots__/x.snap', 'boilerplate'], // snapshot rule precedes test rule
    ['pnpm-lock.yaml', 'boilerplate'],
    ['client/package-lock.json', 'boilerplate'],
    ['yarn.lock', 'boilerplate'],
    ['Cargo.lock', 'boilerplate'],
    ['dist/a.js', 'boilerplate'],
    ['public/x.min.js', 'boilerplate'],
    ['src/api.generated.ts', 'boilerplate'],
    // tests
    ['src/foo.test.tsx', 'tests'],
    ['server/test/a.it.test.ts', 'tests'],
    ['src/b.spec.ts', 'tests'],
    ['server/test/x.ts', 'tests'],
    ['src/__tests__/y.ts', 'tests'],
    ['src/index.test.ts', 'tests'], // tests outranks wiring
    // DELIBERATE first-match-wins decision: tests outranks docs, so a README
    // under e2e/ is classified as tests, not docs.
    ['e2e/README.md', 'tests'],
    // wiring
    ['src/index.ts', 'wiring'],
    ['vitest.config.ts', 'wiring'],
    ['tsconfig.build.json', 'wiring'],
    ['.env.local', 'wiring'],
    ['docker-compose.dev.yml', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],
    ['.claude/skills/security/SKILL.md', 'wiring'], // .claude/** precedes docs
    ['docs/index.ts', 'wiring'], // wiring precedes docs
    // docs
    ['docs/guide.txt', 'docs'],
    ['README', 'docs'],
    ['CHANGELOG.md', 'docs'],
    ['LICENSE', 'docs'],
    ['src/notes.md', 'docs'],
    // core
    ['src/service.ts', 'core'],
    ['package.json', 'core'],
  ];

  it.each(cases)('%s -> %s', (path, role) => {
    expect(classifyPath(path)).toBe(role);
  });
});

const f = (path: string, additions = 1, deletions = 0): PrFileStat => ({ path, additions, deletions });

describe('buildSmartDiff', () => {
  it('orders groups core>tests>wiring>docs>boilerplate regardless of input order, omits empty groups, sorts files by path', () => {
    const files = [
      f('yarn.lock'),
      f('docs/z.md'),
      f('src/index.ts'),
      f('src/b.test.ts'),
      f('src/z.ts'),
      f('src/a.ts'),
    ];
    const out = buildSmartDiff(files, new Map());
    expect(out.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(out.groups[0]!.files.map((x) => x.path)).toEqual(['src/a.ts', 'src/z.ts']);

    const partial = buildSmartDiff([f('docs/a.md'), f('src/a.ts')], new Map());
    expect(partial.groups.map((g) => g.role)).toEqual(['core', 'docs']);
    expect(partial.groups.map((g) => g.role).every((r) => SMART_DIFF_ROLE_ORDER.includes(r))).toBe(true);
    expect(buildSmartDiff([], new Map()).groups).toEqual([]);
  });

  it('sets pseudocode_summary null and attaches finding_lines only for files in the PR', () => {
    const lines = new Map<string, number[]>([
      ['src/a.ts', [3, 9]],
      ['src/not-in-pr.ts', [1]],
    ]);
    const out = buildSmartDiff([f('src/a.ts', 5, 2), f('src/b.ts')], lines);
    const files = out.groups.flatMap((g) => g.files);
    expect(files).toEqual([
      { path: 'src/a.ts', pseudocode_summary: null, additions: 5, deletions: 2, finding_lines: [3, 9] },
      { path: 'src/b.ts', pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
    ]);
    expect(JSON.stringify(out)).not.toContain('not-in-pr');
  });
});

describe('openFindingLinesByPath', () => {
  it('sorts and dedupes lines and excludes dismissed findings', () => {
    const rows: FindingAnchorRow[] = [
      { file: 'a.ts', startLine: 30, dismissedAt: null },
      { file: 'a.ts', startLine: 5, dismissedAt: null },
      { file: 'a.ts', startLine: 30, dismissedAt: null },
      { file: 'a.ts', startLine: 1, dismissedAt: new Date() },
      { file: 'b.ts', startLine: 2, dismissedAt: new Date() },
    ];
    const m = openFindingLinesByPath(rows);
    expect(m.get('a.ts')).toEqual([5, 30]);
    expect(m.has('b.ts')).toBe(false);
  });
});

describe('buildSplitSuggestion', () => {
  const groupOf = (role: SmartDiffRole, lines: number) => ({
    role,
    files: [{ path: `${role}/f`, pseudocode_summary: null, additions: lines, deletions: 0, finding_lines: [] }],
  });

  it('is not too_big at exactly the threshold, too_big just above', () => {
    const at = buildSplitSuggestion([groupOf('core', SPLIT_SUGGESTION_MAX_LINES)]);
    expect(at).toEqual({ too_big: false, total_lines: SPLIT_SUGGESTION_MAX_LINES, proposed_splits: [] });
    const above = buildSplitSuggestion([groupOf('core', SPLIT_SUGGESTION_MAX_LINES + 1)]);
    expect(above.too_big).toBe(true);
  });

  it('excludes boilerplate from total_lines and proposes one split per non-boilerplate role only when too big', () => {
    const groups = [groupOf('core', 300), groupOf('tests', 200), groupOf('boilerplate', 5000)];
    const s = buildSplitSuggestion(groups);
    expect(s.total_lines).toBe(500);
    expect(s.too_big).toBe(true);
    expect(s.proposed_splits.map((p) => p.name)).toEqual(['core', 'tests']);
    expect(s.proposed_splits.flatMap((p) => p.files)).toEqual(['core/f', 'tests/f']);

    const small = buildSplitSuggestion([groupOf('core', 10), groupOf('boilerplate', 5000)]);
    expect(small).toEqual({ too_big: false, total_lines: 10, proposed_splits: [] });
  });
});

describe('PullsService.getSmartDiff', () => {
  const ws = 'ws-1';
  const pr: PullRecord = {
    id: 'pr-1',
    workspaceId: ws,
    repoId: 'repo-1',
    number: 1,
    title: 't',
    author: 'a',
    branch: 'b',
    base: 'main',
    headSha: 'h',
    lastReviewedSha: null,
    additions: 0,
    deletions: 0,
    filesCount: 0,
    status: 'open',
    body: null,
    openedAt: null,
    updatedAt: null,
  };
  const repoRef: RepoRef = { id: 'repo-1', workspaceId: ws, owner: 'o', name: 'n' };

  function makeService(opts: { reviews?: ReviewRollupRow[]; files?: PrFileStat[]; anchors?: FindingAnchorRow[] } = {}) {
    const findingAnchorsForReviewIds = vi.fn(async (_ids: string[]) => opts.anchors ?? []);
    const repo = {
      getPullForWorkspace: async (w: string, id: string) => (w === ws && id === pr.id ? pr : undefined),
      getRepoById: async () => repoRef,
      listPrFileStats: async () => opts.files ?? [],
      reviewRollupForPulls: async () => opts.reviews ?? [],
      findingAnchorsForReviewIds,
    } as unknown as PullsRepo;
    const github = vi.fn(async () => {
      throw new Error('GitHub must not be called by getSmartDiff');
    });
    return { service: new PullsService({ repo, github }), findingAnchorsForReviewIds, github };
  }

  it('throws NotFoundError for a PR outside the workspace', async () => {
    const { service } = makeService();
    await expect(service.getSmartDiff('other-ws', pr.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getSmartDiff(ws, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('feeds only latest-per-agent review ids to the findings query, makes no GitHub call, and returns the grouped diff', async () => {
    // Rows are newest-first (repo contract): rv-a-new supersedes rv-a-old.
    const reviews: ReviewRollupRow[] = [
      { id: 'rv-a-new', prId: pr.id, agentId: 'agent-a', score: 90, verdict: 'approve' },
      { id: 'rv-b', prId: pr.id, agentId: 'agent-b', score: 80, verdict: 'comment' },
      { id: 'rv-a-old', prId: pr.id, agentId: 'agent-a', score: 10, verdict: 'request_changes' },
    ];
    const { service, findingAnchorsForReviewIds, github } = makeService({
      reviews,
      files: [f('src/a.ts', 3, 1)],
      anchors: [{ file: 'src/a.ts', startLine: 7, dismissedAt: null }],
    });
    const out = await service.getSmartDiff(ws, pr.id);

    const ids = findingAnchorsForReviewIds.mock.calls[0]![0];
    expect([...ids].sort()).toEqual(['rv-a-new', 'rv-b']);
    expect(ids).not.toContain('rv-a-old');
    expect(github).not.toHaveBeenCalled();
    expect(out.groups).toEqual([
      {
        role: 'core',
        files: [{ path: 'src/a.ts', pseudocode_summary: null, additions: 3, deletions: 1, finding_lines: [7] }],
      },
    ]);
  });
});
