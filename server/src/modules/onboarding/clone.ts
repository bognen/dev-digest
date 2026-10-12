import { open, stat } from 'node:fs/promises';
import { resolveContainedPath } from '../_shared/checkout-paths.js';

/**
 * Reads at most `maxBytes` of one file off a repo's checkout, containment-
 * checked via `resolveContainedPath` (brief/clone.ts precedent). The cut is
 * moved back to a UTF-8 boundary so a multi-byte character is never split.
 *
 * Never throws: a containment refusal, a missing/non-regular file or any read
 * failure resolves to `null` (NFR-3, EC-13).
 */
export async function readExcerpt(clonePath: string, path: string, maxBytes: number): Promise<string | null> {
  try {
    const real = await resolveContainedPath(clonePath, path);
    const st = await stat(real);
    if (!st.isFile()) return null;
    const fh = await open(real, 'r');
    try {
      const want = Math.min(st.size, maxBytes);
      const buf = Buffer.alloc(want);
      const { bytesRead } = await fh.read(buf, 0, want, 0);
      let end = bytesRead;
      if (st.size > bytesRead) {
        // Truncated: back up over a partial trailing UTF-8 sequence.
        let i = end - 1;
        while (i > 0 && end - i < 4 && (buf[i]! & 0xc0) === 0x80) i -= 1;
        const lead = buf[i]!;
        const need = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
        if (need > end - i) end = i;
      }
      return buf.subarray(0, end).toString('utf8');
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}
