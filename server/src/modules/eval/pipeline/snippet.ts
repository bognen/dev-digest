import { normalizePath, rangesOverlap } from './scoring.js';
import { SNIPPET_MAX_DIFF_LINES } from '../constants.js';

/**
 * Frozen-input extraction for a case created from a finding (AC-3, AC-4).
 * Pure text processing over a raw unified diff — no git, no parser adapter.
 */

interface FileSection {
  path: string;
  header: string[];
  hunks: { newStart: number; newLines: number; lines: string[] }[];
}

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** Split a raw unified diff into per-file sections (path from the `+++` line). */
export function splitDiffByFile(raw: string): FileSection[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const sections: FileSection[] = [];
  let cur: FileSection | null = null;
  let hunk: FileSection['hunks'][number] | null = null;

  const startSection = () => {
    cur = { path: '', header: [], hunks: [] };
    sections.push(cur);
    hunk = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // A new file starts at `diff --git`, or at a bare `---`/`+++` pair (pasted
    // diffs often omit `diff --git`) — unless that pair directly follows the
    // `diff --git` line of the current, still path-less section.
    const gitHeader = line.startsWith('diff --git ');
    const barePair = line.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ');
    const curPathless = cur !== null && (cur as FileSection).path === '' && hunk === null;
    if (gitHeader || (barePair && !curPathless)) startSection();
    if (!cur) continue;
    const section: FileSection = cur;
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      section.path = p === '/dev/null' ? section.path : normalizePath(p);
      section.header.push(line);
      continue;
    }
    const m = HUNK_RE.exec(line);
    if (m) {
      hunk = { newStart: Number(m[1]), newLines: m[2] === undefined ? 1 : Number(m[2]), lines: [line] };
      section.hunks.push(hunk);
      continue;
    }
    if (hunk) {
      if (line === '' && i === lines.length - 1) continue; // trailing newline
      (hunk as FileSection['hunks'][number]).lines.push(line);
    } else {
      section.header.push(line);
    }
  }
  return sections.filter((s) => s.path !== '');
}

function sectionText(s: FileSection, hunks = s.hunks): string {
  return [...s.header, ...hunks.flatMap((h) => h.lines)].join('\n');
}

/**
 * The diff of `file` from a PR's raw diff. When that section exceeds
 * SNIPPET_MAX_DIFF_LINES, only the hunks whose new-side range overlaps
 * [startLine, endLine] are kept (with the file header). Returns null when the
 * file is not in the diff.
 */
export function extractFileSnippet(raw: string, file: string, startLine: number, endLine: number): string | null {
  const target = normalizePath(file);
  const section = splitDiffByFile(raw).find((s) => s.path === target);
  if (!section) return null;
  const total = section.header.length + section.hunks.reduce((n, h) => n + h.lines.length, 0);
  if (total <= SNIPPET_MAX_DIFF_LINES) return sectionText(section);
  const overlapping = section.hunks.filter((h) =>
    rangesOverlap(h.newStart, h.newStart + Math.max(h.newLines, 1) - 1, startLine, endLine),
  );
  return sectionText(section, overlapping.length > 0 ? overlapping : section.hunks);
}
