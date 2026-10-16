import { appendFileSync } from 'node:fs';
import type { DiffCaps } from './diff-cap.js';

/**
 * "Partial review" section (AC-72), appended to the posted body and the job
 * summary when the diff cap dropped files. Skipped paths are PR-controlled
 * strings: they go inside a fenced `text` block whose fence is longer than any
 * backtick run in the paths, so they cannot close the fence or render as
 * markdown links / HTML.
 */
export function buildPartialNote(skipped: readonly string[], caps: DiffCaps): string {
  // Control characters (incl. newlines) are replaced so one path stays one line.
  const paths = skipped.map((p) => p.replace(/[\u0000-\u001f\u007f]/g, '?'));
  let longestRun = 0;
  for (const p of paths) {
    for (const m of p.matchAll(/`+/g)) longestRun = Math.max(longestRun, m[0].length);
  }
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return [
    '### Partial review',
    '',
    `The diff exceeded the size cap (${caps.maxBytes} bytes, ${caps.maxLines} changed lines), so ` +
      `${paths.length} file(s) were not reviewed:`,
    '',
    `${fence}text`,
    ...paths,
    fence,
    '',
  ].join('\n');
}

/** Append markdown to `$GITHUB_STEP_SUMMARY` (best effort; no-op when unset). */
export function appendJobSummary(
  env: Record<string, string | undefined>,
  markdown: string,
  appendFile: typeof appendFileSync = appendFileSync,
): void {
  const summaryPath = env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  try {
    appendFile(summaryPath, `${markdown}\n`);
  } catch {
    /* the review itself already succeeded; the summary is a nicety */
  }
}
