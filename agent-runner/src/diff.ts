import type { UnifiedDiff, DiffHunk } from '@devdigest/shared';

/**
 * Whole `diff --git` sections dropped from the raw diff BEFORE review:
 *
 *  - everything under `.devdigest/` — DevDigest's own exported artifacts (agent
 *    folders, memory, and the ncc runner bundle, a single minified megafile).
 *    GitHub rejects an inline comment on such a file with 422 "diff too large"
 *    and a review is all-or-nothing, so the whole review would fail.
 *  - this agent's OWN generated workflow (`ownWorkflowPath`, exact match only).
 *    Every other `.github/workflows/*` file — including other agents'
 *    `devdigest-review-*.yml` — is ordinary repo code and IS reviewed (D-31).
 *
 * Stripping happens on the RAW diff (not just the parsed file list): single-pass
 * review feeds `diff.raw` straight to the model, so filtering only `files`
 * would still spend tokens on, and let the model cite, the ignored paths.
 * Paths are PR-controlled, so matching is by exact prefix / exact equality only.
 */
export const IGNORED_DIFF_PREFIX = '.devdigest/';

function isIgnoredDiffPath(path: string, ownWorkflowPath: string | undefined): boolean {
  return (
    path.startsWith(IGNORED_DIFF_PREFIX) ||
    (ownWorkflowPath !== undefined && path === ownWorkflowPath)
  );
}

/**
 * Remove whole `diff --git` sections for ignored paths from a raw unified diff,
 * keeping the raw text and the later-parsed file list consistent. GitHub's diff
 * media type emits exactly one `diff --git a/<path> b/<path>` header per file,
 * so splitting on that header and reading the new-side (`b/`) path is enough to
 * decide which sections to drop.
 *
 * `ownWorkflowPath` is optional only so callers not yet migrated keep compiling;
 * the CI pipeline always passes `ciWorkflowPath(slug)`.
 */
export function stripIgnoredFiles(raw: string, ownWorkflowPath?: string): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/ b\/(.*)$/);
      skipping = isIgnoredDiffPath(match?.[1]?.trim() ?? '', ownWorkflowPath);
    }
    if (!skipping) kept.push(line);
  }
  return kept.join('\n');
}

/**
 * Minimal unified-diff parser — a self-contained agent-runner copy of the
 * server's `git/diff-parser.ts` (not importable here: it lives outside this
 * package's owned paths and the bundle must stay self-contained, importing
 * nothing from `node_modules/@devdigest/*` or sibling packages at runtime).
 * Produces the exact `UnifiedDiff` shape the citation-grounding gate
 * (`groundFindings`, reviewer-core) needs: per-file hunks + the set of
 * new-side line numbers each hunk covers.
 *
 * Handles standard unified diff output as returned by GitHub's
 * `Accept: application/vnd.github.v3.diff` PR endpoint:
 *   diff --git a/path b/path
 *   --- a/path
 *   +++ b/path
 *   @@ -oldStart,oldLines +newStart,newLines @@
 */
export function parseUnifiedDiff(raw: string): UnifiedDiff {
  const files: UnifiedDiff['files'] = [];
  const lines = raw.split('\n');
  // A diff string that ends with a trailing newline (the overwhelmingly common
  // case — `git diff`/GitHub's diff endpoint always terminate the last line)
  // produces one extra empty element from `split('\n')`. Without dropping it,
  // that phantom "line" gets counted as a context line, over-extending the
  // last hunk's new-side line coverage by one — which would make the
  // citation-grounding gate too lenient (accepting a finding one line past
  // the real hunk).
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  let current: UnifiedDiff['files'][number] | null = null;
  let hunk: DiffHunk | null = null;
  let newLineCursor = 0;

  const flushHunk = () => {
    if (current && hunk) current.hunks.push(hunk);
    hunk = null;
  };
  const flushFile = () => {
    flushHunk();
    if (current) files.push(current);
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      flushFile();
      current = { path: '', additions: 0, deletions: 0, hunks: [] };
      continue;
    }
    if (line.startsWith('+++ ')) {
      if (!current) current = { path: '', additions: 0, deletions: 0, hunks: [] };
      const p = line.slice(4).replace(/^b\//, '').trim();
      current.path = p === '/dev/null' ? current.path : p;
      continue;
    }
    if (line.startsWith('--- ')) continue;
    const hh = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hh) {
      flushHunk();
      const newStart = Number(hh[3]);
      const newLines = hh[4] ? Number(hh[4]) : 1;
      hunk = {
        file: current?.path ?? '',
        oldStart: Number(hh[1]),
        oldLines: hh[2] ? Number(hh[2]) : 1,
        newStart,
        newLines,
        newLineNumbers: [],
      };
      newLineCursor = newStart;
      continue;
    }
    if (!current || !hunk) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.additions++;
      hunk.newLineNumbers.push(newLineCursor);
      newLineCursor++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.deletions++;
      // deletion: no new-side line consumed
    } else {
      // context line: advances new-side cursor and counts as covered
      hunk.newLineNumbers.push(newLineCursor);
      newLineCursor++;
    }
  }
  flushFile();

  return { raw, files: files.filter((f) => f.path) };
}
