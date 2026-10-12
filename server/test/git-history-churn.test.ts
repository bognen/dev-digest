import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

const hasGit = spawnSync('git', ['--version']).status === 0;
const DAY_MS = 86_400_000;
// Fixed past anchor: if the window were anchored at "now", nothing would match.
const ANCHOR = Date.UTC(2020, 5, 1, 12, 0, 0);
const iso = (offsetDays: number): string => new Date(ANCHOR + offsetDays * DAY_MS).toISOString();

function git(cwd: string, args: string[], date?: string): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
    },
  });
}

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'Test User']);
  git(dir, ['config', 'user.email', 'test@example.com']);
}

/** Write files (path -> content) and commit them at `date` with `message`. */
function commit(dir: string, files: Record<string, string>, date: string, message: string): string {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '--allow-empty', '-m', message], date);
  return git(dir, ['rev-parse', 'HEAD']).trim();
}

describe.skipIf(!hasGit)('SimpleGitClient.historyChurn (real git)', () => {
  let root: string;
  let client: SimpleGitClient;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'devdigest-churn-'));
    client = new SimpleGitClient(join(root, 'clones'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Repo placed where the client expects it: <cloneDir>/<owner>/<name>. */
  function repoAt(name: string) {
    const ref = { owner: 'o', name };
    const dir = client.clonePathFor(ref);
    initRepo(dir);
    return { ref, dir };
  }

  it('AC-8: counts per path inside the 90-day window anchored at the anchor commit date, not now', async () => {
    const { ref, dir } = repoAt('window');
    commit(dir, { 'old.ts': '1' }, iso(-120), 'too old'); // outside window
    commit(dir, { 'a.ts': '1' }, iso(-89), 'edge inside'); // inside (89d before anchor)
    commit(dir, { 'a.ts': '2', 'b.ts': '1' }, iso(-10), 'mid');
    commit(dir, { 'a.ts': '3' }, iso(0), 'anchor');
    git(dir, ['tag', 'anchor']);
    commit(dir, { 'later.ts': '1', 'a.ts': '4' }, iso(30), 'after anchor'); // not reachable from anchor

    const res = await client.historyChurn(ref, 'anchor', 90);

    expect(res.counts).toEqual({ 'a.ts': 3, 'b.ts': 1 });
    expect(res.counts['old.ts']).toBeUndefined();
    expect(res.counts['later.ts']).toBeUndefined();
    expect(res.shallow).toBe(false);
    expect(res.commits).toBe(4); // total history reachable from the anchor
    expect(new Date(res.anchorDate!).getTime()).toBe(ANCHOR);
    expect(new Date(res.oldestDate!).getTime()).toBe(ANCHOR - 120 * DAY_MS);
  });

  it('AC-9/EC-3: a depth-1 clone reports shallow=true with the limited history size', async () => {
    const { dir } = repoAt('full-source');
    commit(dir, { 'a.ts': '1' }, iso(-30), 'first');
    commit(dir, { 'a.ts': '2' }, iso(-20), 'second');
    commit(dir, { 'a.ts': '3' }, iso(-10), 'third');

    const shallowRef = { owner: 'o', name: 'shallow-clone' };
    const dest = client.clonePathFor(shallowRef);
    mkdirSync(dirname(dest), { recursive: true });
    execFileSync(
      'git',
      ['clone', '-q', '--depth', '1', pathToFileURL(dir).href, dest],
      { encoding: 'utf8' },
    );

    const res = await client.historyChurn(shallowRef, 'HEAD', 90);

    expect(res.shallow).toBe(true);
    expect(res.commits).toBe(1);
    expect(new Date(res.oldestDate!).getTime()).toBe(ANCHOR - 10 * DAY_MS);
  });

  it('rejects when the anchor ref does not exist', async () => {
    const { ref, dir } = repoAt('missing-ref');
    commit(dir, { 'a.ts': '1' }, iso(0), 'only');

    await expect(client.historyChurn(ref, 'no-such-ref', 90)).rejects.toThrow();
  });

  it('handles renames without throwing and counts the new path', async () => {
    const { ref, dir } = repoAt('renames');
    commit(dir, { 'src/old-name.ts': 'export const x = 1;\n'.repeat(20) }, iso(-5), 'add');
    git(dir, ['mv', 'src/old-name.ts', 'src/new-name.ts']);
    git(dir, ['commit', '-q', '-m', 'rename'], iso(0));

    const res = await client.historyChurn(ref, 'HEAD', 90);

    expect(res.counts['src/new-name.ts']).toBeGreaterThanOrEqual(1);
    expect(res.commits).toBe(2);
  });

  it('returns raw unquoted paths for spaces and unicode', async () => {
    const { ref, dir } = repoAt('paths');
    commit(dir, { 'dir with space/file name.ts': '1', 'src/файл-é.ts': '1' }, iso(-2), 'one');
    commit(dir, { 'src/файл-é.ts': '2' }, iso(0), 'two');

    const res = await client.historyChurn(ref, 'HEAD', 90);

    expect(res.counts['dir with space/file name.ts']).toBe(1);
    expect(res.counts['src/файл-é.ts']).toBe(2);
    expect(Object.keys(res.counts).some((p) => p.includes('"') || p.includes('\\'))).toBe(false);
  });

  it('never parses commit messages: metacharacters, option-like and path-like text are inert', async () => {
    const { ref, dir } = repoAt('messages');
    const nasty = [
      '--since=1999-01-01 --all; rm -rf / $(whoami) `id` && echo "x" | cat',
      '',
      'fake-file-in-message.ts',
      '\u0001 %H %x00 %s {{}} \\n',
    ].join('\n');
    commit(dir, { 'a.ts': '1' }, iso(-3), nasty);
    commit(dir, { 'a.ts': '2', 'b.ts': '1' }, iso(0), '-n 1 --name-only\n\nsneaky.ts\n');

    const res = await client.historyChurn(ref, 'HEAD', 90);

    expect(res.counts).toEqual({ 'a.ts': 2, 'b.ts': 1 });
    expect(res.commits).toBe(2);
  });
});
