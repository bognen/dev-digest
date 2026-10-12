import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discover, read } from '../src/modules/project-context/checkout.js';
import { MAX_DOC_BYTES } from '../src/modules/project-context/constants.js';

let root: string;
let outside: string;

async function put(rel: string, data: string | Buffer): Promise<void> {
  const full = join(root, ...rel.split('/'));
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, data);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pc-root-'));
  outside = await mkdtemp(join(tmpdir(), 'pc-out-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('discover', () => {
  it('AC-1/EC-10: lists .md at any depth under the roots by full path, sorted', async () => {
    await put('specs/a.md', '# a');
    await put('docs/a/b/deep.md', '# deep');
    await put('docs/a/b/c/readme.md', '# r');
    await put('insights/a.md', '# i');
    await put('docs/a.md', '# same name');

    const paths = (await discover(root)).map((d) => d.path);
    expect(paths).toEqual([
      'docs/a.md',
      'docs/a/b/c/readme.md',
      'docs/a/b/deep.md',
      'insights/a.md',
      'specs/a.md',
    ]);
  });

  it('AC-2: excludes root README, non-md files, ignored dirs and other folders', async () => {
    await put('README.md', 'x');
    await put('docs/a.txt', 'x');
    await put('docs/node_modules/x/readme.md', 'x');
    await put('src/notes.md', 'x');
    await put('docs/keep.md', 'x');
    expect((await discover(root)).map((d) => d.path)).toEqual(['docs/keep.md']);
  });

  it('AC-7: empty checkout gives an empty list', async () => {
    expect(await discover(root)).toEqual([]);
  });

  it('does not list a symlinked file pointing outside the checkout', async () => {
    await writeFile(join(outside, 'secret.md'), 'secret');
    await mkdir(join(root, 'docs'), { recursive: true });
    try {
      await symlink(join(outside, 'secret.md'), join(root, 'docs', 'link.md'));
    } catch {
      return; // symlink creation not permitted (Windows without privilege)
    }
    await put('docs/ok.md', 'ok');
    expect((await discover(root)).map((d) => d.path)).toEqual(['docs/ok.md']);
  });
});

describe('read', () => {
  it('returns content of a regular document', async () => {
    await put('docs/ok.md', 'héllo');
    expect(await read(root, 'docs/ok.md')).toEqual({ ok: true, content: 'héllo' });
  });

  it('AC-33: missing file gives missing', async () => {
    expect(await read(root, 'docs/nope.md')).toEqual({ ok: false, reason: 'missing' });
  });

  it('AC-35/EC-8: traversal and absolute paths are refused without content', async () => {
    await writeFile(join(outside, 'x.md'), 'secret');
    for (const p of ['../../etc/passwd', '../x.md', join(outside, 'x.md')]) {
      const r = await read(root, p);
      expect(r).toEqual({ ok: false, reason: 'refused_containment' });
    }
  });

  it('AC-35/NFR-4a: an outward symlink is refused, content never returned', async () => {
    await writeFile(join(outside, 'secret.md'), 'TOP SECRET');
    await mkdir(join(root, 'docs'), { recursive: true });
    try {
      await symlink(join(outside, 'secret.md'), join(root, 'docs', 'link.md'));
    } catch {
      return; // symlink creation not permitted
    }
    const r = await read(root, 'docs/link.md');
    expect(r).toEqual({ ok: false, reason: 'refused_containment' });
    expect(JSON.stringify(r)).not.toContain('TOP SECRET');
  });

  it('AC-9/NFR-4d: exactly the limit is readable, one byte over is too_large', async () => {
    await put('docs/at.md', 'a'.repeat(MAX_DOC_BYTES));
    await put('docs/over.md', 'a'.repeat(MAX_DOC_BYTES + 1));
    expect((await read(root, 'docs/at.md')).ok).toBe(true);
    expect(await read(root, 'docs/over.md')).toEqual({ ok: false, reason: 'too_large' });
  });

  it('AC-33/EC-7: binary and non-UTF-8 files are unreadable', async () => {
    await put('docs/bin.md', Buffer.from([0x23, 0x20, 0x00, 0x01, 0x02]));
    await put('docs/latin1.md', Buffer.from([0x68, 0xe9, 0xff, 0xfe, 0x6c]));
    expect(await read(root, 'docs/bin.md')).toEqual({ ok: false, reason: 'unreadable' });
    expect(await read(root, 'docs/latin1.md')).toEqual({ ok: false, reason: 'unreadable' });
  });
});
