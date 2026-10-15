/**
 * Diff size cap with partial review (AC-71, AC-72). Self-contained: the bundle
 * imports nothing from sibling packages. Pure apart from the optional logger.
 *
 * The cap is applied to the RAW diff after `stripIgnoredFiles`. When the diff
 * exceeds either cap, whole per-file sections are kept largest-change-first
 * until the budget is spent; the rest are reported as skipped so the run can
 * review a subset and say so (partial review) instead of failing.
 */

export const DEFAULT_MAX_DIFF_BYTES = 204_800;
export const DEFAULT_MAX_DIFF_LINES = 3_000;

export interface DiffCaps {
  maxBytes: number;
  maxLines: number;
}

export interface DiffCapResult {
  /** Kept sections, in their ORIGINAL order. */
  raw: string;
  /** Repo-relative paths of sections that did not fit, in the order they were dropped. */
  skipped: string[];
  caps: DiffCaps;
  partial: boolean;
}

type EnvLike = Record<string, string | undefined>;

function parsePositiveInt(
  env: EnvLike,
  name: string,
  fallback: number,
  log: (message: string) => void,
): number {
  const value = env[name];
  if (value === undefined || value.trim() === '') return fallback;
  const trimmed = value.trim();
  const n = Number(trimmed);
  if (/^\d+$/.test(trimmed) && Number.isSafeInteger(n) && n > 0) return n;
  log(`${name}="${value}" is not a positive integer; using default ${fallback}`);
  return fallback;
}

/** Read `DEVDIGEST_MAX_DIFF_BYTES` / `DEVDIGEST_MAX_DIFF_LINES`; log once per fallback. */
export function resolveDiffCaps(
  env: EnvLike,
  log: (message: string) => void = () => {},
): DiffCaps {
  return {
    maxBytes: parsePositiveInt(env, 'DEVDIGEST_MAX_DIFF_BYTES', DEFAULT_MAX_DIFF_BYTES, log),
    maxLines: parsePositiveInt(env, 'DEVDIGEST_MAX_DIFF_LINES', DEFAULT_MAX_DIFF_LINES, log),
  };
}

interface Section {
  index: number;
  path: string;
  text: string;
  bytes: number;
  /** Changed lines (`+` / `-` content lines, excluding file headers). */
  lines: number;
}

function sectionPath(header: string): string {
  const match = header.match(/ b\/(.*)$/);
  return (match?.[1] ?? '').trim();
}

function countChangedLines(text: string): number {
  let n = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) n++;
    else if (line.startsWith('-') && !line.startsWith('---')) n++;
  }
  return n;
}

/**
 * Cap a raw unified diff. Sections are ordered by changed lines descending,
 * then bytes descending, then path ascending, and taken greedily while the
 * cumulative bytes <= `maxBytes` AND cumulative changed lines <= `maxLines`; a
 * section that does not fit is skipped and smaller ones are still tried.
 * The line cap counts changed lines (the same metric used for ordering).
 */
export function applyDiffCap(raw: string, caps: DiffCaps): DiffCapResult {
  // Split before every `diff --git` header, keeping each header with its section.
  const parts = raw.split(/(?=^diff --git )/m);
  const preamble = parts.length > 0 && !parts[0]!.startsWith('diff --git') ? parts.shift()! : '';

  const sections: Section[] = parts.map((text, index) => ({
    index,
    path: sectionPath(text.split('\n', 1)[0] ?? ''),
    text,
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: countChangedLines(text),
  }));

  const ordered = [...sections].sort(
    (a, b) =>
      b.lines - a.lines ||
      b.bytes - a.bytes ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );

  let usedBytes = Buffer.byteLength(preamble, 'utf8');
  let usedLines = 0;
  const keptIdx = new Set<number>();
  const skipped: string[] = [];
  for (const s of ordered) {
    if (usedBytes + s.bytes <= caps.maxBytes && usedLines + s.lines <= caps.maxLines) {
      usedBytes += s.bytes;
      usedLines += s.lines;
      keptIdx.add(s.index);
    } else {
      skipped.push(s.path);
    }
  }

  if (skipped.length === 0) return { raw, skipped, caps, partial: false };

  const keptText = sections.filter((s) => keptIdx.has(s.index)).map((s) => s.text);
  return { raw: preamble + keptText.join(''), skipped, caps, partial: true };
}
