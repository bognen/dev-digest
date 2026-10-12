import { lstat, open, readdir, stat } from 'node:fs/promises';
import { posix } from 'node:path';
import {
  ContainmentError,
  MissingPathError,
  resolveContainedPath,
} from '../_shared/checkout-paths.js';
import { IGNORED_DIRS, MAX_DISCOVERED_DOCS, MAX_DOC_BYTES, PROJECT_DOC_ROOTS } from './constants.js';
import type { CheckoutReader, DiscoveredDoc, ReadDocResult } from './types.js';

/**
 * Filesystem edge for project-context: discovery of `*.md` under the doc roots
 * and containment-checked reads (every read goes through `resolveContainedPath`,
 * pattern: `brief/clone.ts`). Never follows directory symlinks.
 */

const MD_RE = /\.md$/i;

async function walk(
  clonePath: string,
  rel: string,
  out: DiscoveredDoc[],
): Promise<void> {
  if (out.length >= MAX_DISCOVERED_DOCS) return;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(`${clonePath}/${rel}`, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (out.length >= MAX_DISCOVERED_DOCS) return;
    const childRel = posix.join(rel, e.name);
    if (e.isDirectory()) {
      if (IGNORED_DIRS.includes(e.name)) continue;
      await walk(clonePath, childRel, out);
    } else if (e.isFile() || e.isSymbolicLink()) {
      if (!MD_RE.test(e.name)) continue;
      try {
        // Symlinked files must resolve inside the checkout; others are cheap to re-check.
        const real = await resolveContainedPath(clonePath, childRel);
        const st = await stat(real);
        if (!st.isFile()) continue;
        out.push({ path: childRel, sizeBytes: st.size });
      } catch {
        // escaping / dangling / unreadable entries are simply not listed
      }
    }
  }
}

export async function discover(clonePath: string): Promise<DiscoveredDoc[]> {
  const out: DiscoveredDoc[] = [];
  for (const root of PROJECT_DOC_ROOTS) {
    try {
      const st = await lstat(`${clonePath}/${root}`);
      if (!st.isDirectory()) continue; // never follow a symlinked root
    } catch {
      continue;
    }
    await walk(clonePath, root, out);
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

export async function read(clonePath: string, path: string): Promise<ReadDocResult> {
  try {
    const real = await resolveContainedPath(clonePath, path);
    const st = await stat(real);
    if (!st.isFile()) return { ok: false, reason: 'unreadable' };
    // Size gate BEFORE reading content (NFR-4d).
    if (st.size > MAX_DOC_BYTES) return { ok: false, reason: 'too_large' };

    // Bounded read: even if the file grows after stat, never exceed the limit.
    const fh = await open(real, 'r');
    let buf: Buffer;
    try {
      const chunk = Buffer.allocUnsafe(MAX_DOC_BYTES + 1);
      const { bytesRead } = await fh.read(chunk, 0, MAX_DOC_BYTES + 1, 0);
      if (bytesRead > MAX_DOC_BYTES) return { ok: false, reason: 'too_large' };
      buf = chunk.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }

    if (buf.includes(0)) return { ok: false, reason: 'unreadable' };
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return { ok: true, content };
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
  } catch (err) {
    if (err instanceof ContainmentError) return { ok: false, reason: 'refused_containment' };
    if (err instanceof MissingPathError) return { ok: false, reason: 'missing' };
    return { ok: false, reason: 'unreadable' };
  }
}

/** The injectable `CheckoutReader` port implementation. */
export const checkoutReader: CheckoutReader = { discover, read };
