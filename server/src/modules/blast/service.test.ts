import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../platform/errors.js';
import { BlastService, type PrFileLookup } from './service.js';
import type { BlastResult, IndexState, RepoIntel } from '../repo-intel/types.js';

/**
 * Hermetic unit test — fake `PrFileLookup` + fake `RepoIntel` ports, no DB, no
 * container. Same "fake repo, no DB" approach as reviews/service.test.ts.
 */

const PULL = { id: 'pr1', repoId: 'repo1', number: 7, headSha: 'headsha1' };
const FILES = [{ path: 'src/utils/helper.ts' }];

function buildService(overrides?: {
  getPull?: () => Promise<typeof PULL | undefined>;
  getBlastRadius?: (...args: unknown[]) => Promise<BlastResult>;
  getIndexState?: () => Promise<IndexState>;
}) {
  const prFiles: PrFileLookup = {
    getPull: overrides?.getPull ?? (async () => PULL),
    getPrFiles: async () => FILES,
  };
  const repoIntel = {
    getBlastRadius:
      overrides?.getBlastRadius ??
      (async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false })),
    getIndexState:
      overrides?.getIndexState ??
      (async () => ({
        repoId: 'repo1',
        status: 'full',
        filesIndexed: 10,
        filesSkipped: 0,
        durationMs: 5,
        lastIndexedSha: 'sha1',
        indexerVersion: 2,
        updatedAt: new Date(0),
      })),
  } as unknown as RepoIntel;
  return { service: new BlastService(prFiles, repoIntel) };
}

describe('BlastService.getBlast', () => {
  it('throws NotFoundError when the pull does not exist', async () => {
    const { service } = buildService({ getPull: async () => undefined });
    await expect(service.getBlast('ws1', 'missing')).rejects.toThrow(NotFoundError);
  });

  it('asks repo-intel to report caller lines against the PR head commit', async () => {
    const calls: unknown[][] = [];
    const { service } = buildService({
      getBlastRadius: async (...args) => {
        calls.push(args);
        return { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };
      },
    });
    await service.getBlast('ws1', 'pr1');
    expect(calls[0]).toEqual(['repo1', ['src/utils/helper.ts'], { sha: 'headsha1', prNumber: 7 }]);
  });

  it('groups callers by viaSymbol and attaches facts from the group\'s own caller files', async () => {
    const { service } = buildService({
      getBlastRadius: async () => ({
        changedSymbols: [
          { file: 'src/utils/helper.ts', name: 'helper', kind: 'function' },
          { file: 'src/utils/helper.ts', name: 'unused', kind: 'function' },
        ],
        callers: [
          { file: 'src/api/route.ts', symbol: 'handler', viaSymbol: 'helper', line: 10, rank: 5 },
          { file: 'src/api/other.ts', symbol: 'otherHandler', viaSymbol: 'helper', line: 20, rank: 3 },
        ],
        impactedEndpoints: ['GET /x'],
        factsByFile: {
          'src/api/route.ts': { endpoints: ['GET /x'], crons: [] },
          'src/api/other.ts': { endpoints: [], crons: ['nightly-job'] },
        },
        degraded: false,
      }),
    });

    const result = await service.getBlast('ws1', 'pr1');

    expect(result.status).toBe('full');
    expect(result.degradedReason).toBeUndefined();
    expect(result.data.changed_symbols).toHaveLength(2);
    // `unused` has zero callers → no downstream group for it.
    expect(result.data.downstream).toHaveLength(1);
    const helperGroup = result.data.downstream[0]!;
    expect(helperGroup.symbol).toBe('helper');
    expect(helperGroup.callers).toEqual([
      { name: 'handler', file: 'src/api/route.ts', line: 10, rank: 5 },
      { name: 'otherHandler', file: 'src/api/other.ts', line: 20, rank: 3 },
    ]);
    expect(helperGroup.endpoints_affected).toEqual(['GET /x']);
    expect(helperGroup.crons_affected).toEqual(['nightly-job']);
    expect(result.data.summary).toBe('2 symbols · 2 callers · 1 endpoint · 1 cron');
  });

  it('prefers the blast result\'s own degraded reason over the index state\'s', async () => {
    const { service } = buildService({
      getBlastRadius: async () => ({
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: true,
        reason: 'no_data',
      }),
      getIndexState: async () => ({
        repoId: 'repo1',
        status: 'partial',
        filesIndexed: 1,
        filesSkipped: 0,
        durationMs: 1,
        lastIndexedSha: 'sha1',
        indexerVersion: 2,
        updatedAt: new Date(0),
        degradedReason: 'index_partial',
      }),
    });

    const result = await service.getBlast('ws1', 'pr1');

    expect(result.status).toBe('partial');
    expect(result.degradedReason).toBe('no_data');
  });

  it('falls back to the index state\'s degraded reason when the blast result has none', async () => {
    const { service } = buildService({
      getIndexState: async () => ({
        repoId: 'repo1',
        status: 'degraded',
        filesIndexed: 0,
        filesSkipped: 0,
        durationMs: 0,
        lastIndexedSha: '',
        indexerVersion: 2,
        updatedAt: new Date(0),
        degraded: true,
        degradedReason: 'index_failed',
      }),
    });

    const result = await service.getBlast('ws1', 'pr1');

    expect(result.status).toBe('degraded');
    expect(result.degradedReason).toBe('index_failed');
  });

  it('logs source "index" when not degraded and "fallback" when degraded, via the injected logger', async () => {
    const logs: { obj: Record<string, unknown>; msg: string }[] = [];
    const log = { info: (obj: object, msg: string) => void logs.push({ obj: obj as Record<string, unknown>, msg }) };

    const ok = buildService();
    await ok.service.getBlast('ws1', 'pr1', { log });
    const degraded = buildService({
      getBlastRadius: async () => ({
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: true,
        reason: 'flag_off',
      }),
    });
    await degraded.service.getBlast('ws1', 'pr1', { log });

    expect(logs).toHaveLength(2);
    expect(logs[0]!.obj.source).toBe('index');
    expect(logs[1]!.obj.source).toBe('fallback');
  });

  it('does not throw when opts (and so the logger) are omitted', async () => {
    const { service } = buildService();
    await expect(service.getBlast('ws1', 'pr1')).resolves.toMatchObject({ status: 'full' });
  });
});
