import type { OnboardingTour, RunStepKind, TourSkeletonReason } from '@devdigest/shared';
import {
  EXCLUDED_PATH_PATTERNS,
  FIRST_TASKS_MAX,
  FIRST_TASKS_MIN,
  HOTNESS_WINDOW_DAYS,
  MAX_CRITICAL_PATHS,
  MAX_DIAGRAM_CHARS,
  MAX_ERROR_DETAIL_CHARS,
  MAX_READING_PATH,
  MAX_ROUTES,
  MAX_RUN_STEPS,
  MAX_STACK,
  MAX_STRUCTURE,
  RUN_KIND_ORDER,
} from './constants.js';
import { OnboardingLlmOutput } from './schemas.js';
import type {
  CriticalPathItem,
  DetectedCommand,
  DroppedCounts,
  FileHotness,
  IndexStateLite,
  PersistOutcome,
  RankedFileRow,
  ReadingPathItem,
  RepoFacts,
  ScoredFile,
  SymbolLite,
  TourFacts,
  ValidatedLlm,
  ValidationContext,
  ValidationResult,
} from './types.js';

/**
 * Pure onboarding-tour rules (no I/O, no clock, no randomness). Every sort is
 * total — (score desc, path asc) — so an unchanged index gives byte-identical
 * output (AC-7).
 */

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);
const byPathAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// --- Exclusions (AC-10) -----------------------------------------------------

export function isExcludedFromTour(path: string): boolean {
  const p = '/' + path.replaceAll('\\', '/').toLowerCase();
  return EXCLUDED_PATH_PATTERNS.some((re) => re.test(p));
}

// --- Scoring (AC-7, AC-8, AC-9) ---------------------------------------------

export function normalizeHotness(counts: Record<string, number>): Record<string, number> {
  const values = Object.values(counts);
  const max = values.length > 0 ? Math.max(...values) : 0;
  const out: Record<string, number> = {};
  for (const [path, n] of Object.entries(counts)) out[path] = max > 0 ? n / max : 0;
  return out;
}

export function scoreReadingPath(
  rows: RankedFileRow[],
  hotness: Record<string, number>,
  applied: boolean,
): ScoredFile[] {
  return rows
    .filter((r) => !isExcludedFromTour(r.path))
    .map((r) => {
      const h = applied ? (hotness[r.path] ?? 0) : 0;
      return { path: r.path, pagerank: r.pagerank, hotness: h, importers: r.importers, score: r.pagerank * (1 + h) };
    })
    .sort((a, b) => b.score - a.score || byPathAsc(a.path, b.path));
}

/** AC-11: ranked files by pure PageRank (path asc for ties), max 5. */
export function selectCriticalPaths(
  rows: RankedFileRow[],
  symbolsByPath: Record<string, string[]>,
): CriticalPathItem[] {
  return rows
    .filter((r) => !isExcludedFromTour(r.path))
    .sort((a, b) => b.pagerank - a.pagerank || byPathAsc(a.path, b.path))
    .slice(0, MAX_CRITICAL_PATHS)
    .map((r) => {
      const names = (symbolsByPath[r.path] ?? []).slice(0, 5);
      const base = `Imported by ${r.importers} file${r.importers === 1 ? '' : 's'}`;
      return {
        path: r.path,
        importers: r.importers,
        role: names.length > 0 ? `${base}; exports ${names.join(', ')}` : base,
        role_source: 'deterministic' as const,
      };
    });
}

/** AC-12: positions 1..n with a deterministic, non-empty reason. */
export function buildReadingPath(
  scored: ScoredFile[],
  limit: number = MAX_READING_PATH,
  commits?: Record<string, number>,
  windowDays: number = HOTNESS_WINDOW_DAYS,
): ReadingPathItem[] {
  const rankOf = new Map<string, number>();
  [...scored]
    .sort((a, b) => b.pagerank - a.pagerank || byPathAsc(a.path, b.path))
    .forEach((s, i) => rankOf.set(s.path, i + 1));
  return scored.slice(0, limit).map((s, i) => {
    const parts = [`PageRank #${rankOf.get(s.path) ?? i + 1}`, `imported by ${s.importers} file${s.importers === 1 ? '' : 's'}`];
    const c = commits?.[s.path];
    if (c != null) parts.push(`${c} commit${c === 1 ? '' : 's'} in the last ${windowDays} days`);
    return { position: i + 1, path: s.path, reason: parts.join('; '), score: s.score };
  });
}

// --- Run steps (AC-20, AC-22) -----------------------------------------------

export function orderRunSteps(cmds: DetectedCommand[]): DetectedCommand[] {
  const seen = new Set<string>();
  const indexed: Array<{ c: DetectedCommand; i: number }> = [];
  cmds.forEach((c, i) => {
    const key = `${c.command}\u0000${c.source}`;
    if (seen.has(key)) return;
    seen.add(key);
    indexed.push({ c, i });
  });
  const rank = (k: RunStepKind): number => RUN_KIND_ORDER.indexOf(k);
  return indexed
    .sort((a, b) => rank(a.c.kind) - rank(b.c.kind) || byPathAsc(a.c.source, b.c.source) || a.i - b.i)
    .map((x) => x.c);
}

// --- Hotness / index state --------------------------------------------------

export function hotnessNote(h: FileHotness): string | null {
  if (h.applied) return null;
  if (h.reason === 'no_clone' || h.reason === 'commit_missing' || h.reason === 'git_failed' || h.reason === 'flag_off') {
    return `Hotness not applied: git history unavailable (${h.reason.replaceAll('_', ' ')}).`;
  }
  return (
    `Hotness not applied: the checkout has ${h.commitsAvailable} commit(s) covering ` +
    `${h.historyDays} day(s) of history; ${h.windowDays || HOTNESS_WINDOW_DAYS} days are needed.`
  );
}

export function skeletonReasonFor(state: IndexStateLite): TourSkeletonReason | null {
  if (state.status === 'failed') return 'index_failed';
  if (state.status === 'degraded') {
    if (state.degradedReason === 'no_data' || state.reason === 'no_data' || !state.lastIndexedSha) {
      return 'index_not_built';
    }
    return 'index_degraded';
  }
  return null;
}

export function isStale(tourSha: string, currentSha: string | null): boolean {
  return currentSha != null && currentSha !== '' && tourSha !== currentSha;
}

export function shortSha(s: string): string {
  return s.slice(0, 7);
}

// --- Fact assembly ----------------------------------------------------------

export function buildTourFacts(input: {
  indexState: IndexStateLite;
  repoFacts: RepoFacts;
  ranked: RankedFileRow[];
  hotness: FileHotness;
  symbols: SymbolLite[];
}): TourFacts {
  const { indexState, repoFacts, ranked, hotness, symbols } = input;
  const symbolsByPath: Record<string, string[]> = {};
  for (const s of symbols) {
    if (!s.exported) continue;
    (symbolsByPath[s.file] ??= []).push(s.name);
  }
  for (const k of Object.keys(symbolsByPath)) symbolsByPath[k]!.sort(byPathAsc);

  const scored = scoreReadingPath(ranked, normalizeHotness(hotness.counts), hotness.applied);
  return {
    filesIndexed: indexState.filesIndexed,
    filesConsidered: 0,
    stack: repoFacts.stack,
    structure: repoFacts.structure,
    routes: repoFacts.routes,
    commands: orderRunSteps(repoFacts.commands),
    criticalPaths: selectCriticalPaths(ranked, symbolsByPath),
    readingPath: buildReadingPath(scored, MAX_READING_PATH, hotness.applied ? hotness.counts : undefined, hotness.windowDays),
    hotness: { applied: hotness.applied, windowDays: hotness.windowDays, note: hotnessNote(hotness) },
    indexPaths: ranked.map((r) => r.path).sort(byPathAsc),
  };
}

// --- Skeleton (AC-24, AC-25) ------------------------------------------------

export function buildSkeleton(facts: TourFacts): OnboardingTour {
  const noGraph =
    facts.filesIndexed === 0
      ? 'No import graph for this language (0 files indexed)'
      : 'No eligible files after excluding tests, configs and generated files';

  const hasArchFacts = facts.stack.length + facts.structure.length + facts.routes.length > 0;
  return {
    architecture: {
      state: hasArchFacts ? 'requires_generation' : 'not_available',
      reason: hasArchFacts ? null : 'No stack, structure or routes detected',
      stack: facts.stack.slice(0, MAX_STACK).map((s) => ({ name: clip(s.name, 100), evidence: clip(s.evidence, 300) })),
      structure: facts.structure.slice(0, MAX_STRUCTURE).map((d) => ({ path: clip(d.path, 500), files: d.files })),
      routes: facts.routes.slice(0, MAX_ROUTES).map((r) => clip(r, 300)),
      summary_markdown: null,
      diagram: null,
    },
    critical_paths:
      facts.criticalPaths.length > 0
        ? { state: 'ok', reason: null, items: facts.criticalPaths.map((c) => ({ ...c, role: clip(c.role, 500) })) }
        : { state: 'not_available', reason: noGraph, items: [] },
    run_locally:
      facts.commands.length > 0
        ? {
            state: 'ok',
            reason: null,
            steps: facts.commands
              .slice(0, MAX_RUN_STEPS)
              .map((c) => ({ kind: c.kind, command: clip(c.command, 500), source: clip(c.source, 300) })),
          }
        : {
            state: 'not_available',
            reason: 'No run commands detected (no package manifest, compose file, env example or README shell block)',
            steps: [],
          },
    reading_path: {
      ...(facts.readingPath.length > 0
        ? { state: 'ok' as const, reason: null }
        : { state: 'not_available' as const, reason: noGraph }),
      items: facts.readingPath.map((r) => ({ ...r, reason: clip(r.reason, 500) })),
      hotness: {
        applied: facts.hotness.applied,
        window_days: facts.hotness.windowDays,
        note: facts.hotness.note ? clip(facts.hotness.note, 500) : null,
      },
    },
    first_tasks: { state: 'requires_generation', reason: null, items: [] },
    basis: { files_indexed: facts.filesIndexed, files_considered: facts.filesConsidered },
    link_paths: [],
  };
}

// --- Sanitisation (AC-19, AC-35, NFR-3b) ------------------------------------

const DIAGRAM_HEADER = /^((?:flowchart|graph)[ \t]+(?:LR|RL|TD|TB|BT))[ \t;]+(?=\S)/i;
const DIAGRAM_ARROW = /^(?:-->|---|-\.->|==>)(?:\|[^|\n]*\|)?/;
const DIAGRAM_ID = /^[A-Za-z_][A-Za-z0-9_]*/;
const DIAGRAM_RESERVED = new Set(['subgraph', 'end', 'style', 'classdef', 'class', 'linkstyle', 'direction', 'click']);
const BRACKET_CLOSERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/** Length of the bracket group starting at `i` (balanced, quote-aware), or -1. */
function bracketGroupLength(src: string, i: number): number {
  const stack: string[] = [];
  let j = i;
  if (src[j] === '>') {
    stack.push(']');
    j += 1;
  }
  let inQuote = false;
  for (; j < src.length; j += 1) {
    const ch = src[j]!;
    if (inQuote) {
      if (ch === '"') inQuote = false;
      continue;
    }
    if (ch === '"') inQuote = true;
    else if (BRACKET_CLOSERS[ch]) stack.push(BRACKET_CLOSERS[ch]!);
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return j - i + 1;
    }
  }
  return -1;
}

/**
 * Deterministic repair for a diagram the model emitted on ONE line (statements
 * separated by spaces instead of newlines), which Mermaid cannot parse. Splits
 * `NODE (ARROW NODE)*` chains into one statement per line. Conservative: on any
 * doubt (multiline input, subgraph/style/etc., unbalanced brackets, unknown
 * syntax) returns the input unchanged; never throws, reorders or drops tokens.
 */
export function repairDiagramLines(src: string): string {
  try {
    if (/[\r\n]/.test(src)) return src;
    const trimmed = src.trim();
    const head = DIAGRAM_HEADER.exec(trimmed);
    if (!head) return src;
    const body = trimmed.slice(head[0].length);
    const statements: string[][] = [];
    let current: string[] = [];
    let prev: 'none' | 'node' | 'arrow' = 'none';
    let i = 0;
    while (i < body.length) {
      const ch = body[i]!;
      if (ch === ' ' || ch === '\t') {
        i += 1;
        continue;
      }
      if (ch === ';') {
        if (prev === 'arrow') return src;
        if (current.length > 0) statements.push(current);
        current = [];
        prev = 'none';
        i += 1;
        continue;
      }
      const rest = body.slice(i);
      const arrow = DIAGRAM_ARROW.exec(rest);
      if (arrow) {
        if (prev !== 'node') return src;
        current.push(arrow[0]);
        prev = 'arrow';
        i += arrow[0].length;
        continue;
      }
      const id = DIAGRAM_ID.exec(rest);
      if (!id || DIAGRAM_RESERVED.has(id[0].toLowerCase())) return src;
      let node = id[0];
      i += node.length;
      const opener = body[i];
      if (opener === '[' || opener === '(' || opener === '{' || opener === '>') {
        const len = bracketGroupLength(body, i);
        if (len < 0) return src;
        node += body.slice(i, i + len);
        i += len;
      }
      if (prev === 'node') {
        statements.push(current);
        current = [];
      }
      current.push(node);
      prev = 'node';
    }
    if (prev === 'arrow') return src;
    if (current.length > 0) statements.push(current);
    if (statements.length < 2) return src;
    return [head[1]!, ...statements.map((st) => '  ' + st.join(' '))].join('\n');
  } catch {
    return src;
  }
}

export function sanitizeDiagram(src: string | null): string | null {
  if (src == null) return null;
  const s = repairDiagramLines(src.trim());
  if (s.length === 0 || s.length > MAX_DIAGRAM_CHARS) return null;
  if (!/^(flowchart|graph)\b/i.test(s)) return null;
  if (/[<]|\bclick\s|href|\bcall\s|%%\{|```|javascript:/i.test(s)) return null;
  return s;
}

export function neutralizeMarkdown(md: string, indexPaths: Set<string>): { text: string; linkPaths: string[] } {
  const linkPaths = new Set<string>();
  let text = md.replaceAll('<', '&lt;');
  // Reference-style link definitions.
  text = text.replace(/^[ \t]*\[[^\]]+\]:[ \t]*\S.*$/gm, '');
  // Images -> alt text.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Inline links: keep only relative paths present in the index.
  text = text.replace(/\[([^\]]*)\]\(\s*([^)\s]*)(?:\s+"[^"]*")?\s*\)/g, (_m, label: string, href: string) => {
    const p = href.startsWith('./') ? href.slice(2) : href;
    if (indexPaths.has(p)) {
      linkPaths.add(p);
      return `[${label}](${p})`;
    }
    return label;
  });
  // Reference-style usages `[text][ref]` -> text.
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  // Bare URLs / dangerous schemes -> inert code spans so GFM cannot autolink.
  text = text.replace(/(?<!`)\b(?:https?:\/\/|javascript:|data:|vbscript:|www\.)[^\s)`]*/gi, (m) => `\`${m}\``);
  return { text, linkPaths: [...linkPaths].sort(byPathAsc) };
}

// --- LLM output validation (AC-15, AC-18, AC-21, AC-23) ---------------------

export function validateLlmOutput(raw: unknown, ctx: ValidationContext): ValidationResult {
  const parsed = OnboardingLlmOutput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return { ok: false, reason: clip(`${where}${issue?.message ?? 'invalid output'}`, 300) };
  }
  const out = parsed.data;
  const dropped: DroppedCounts = { paths: 0, commands: 0, entries: 0 };
  const criticalSet = new Set(ctx.criticalPaths);
  const readingSet = new Set(ctx.readingPaths);

  const pick = (
    entries: Array<{ path: string; text: string }>,
    allowed: Set<string>,
  ): Record<string, string> => {
    const res: Record<string, string> = {};
    for (const e of entries) {
      if (!ctx.indexPaths.has(e.path)) {
        dropped.paths += 1;
        dropped.entries += 1;
      } else if (!allowed.has(e.path) || e.path in res) {
        dropped.entries += 1;
      } else {
        res[e.path] = e.text;
      }
    }
    return res;
  };
  const criticalRoles = pick(out.critical_paths.map((e) => ({ path: e.path, text: e.role })), criticalSet);
  const readingReasons = pick(out.reading_path.map((e) => ({ path: e.path, text: e.reason })), readingSet);

  const detected = new Set(ctx.commands.map((c) => c.command));
  const commands: string[] = [];
  for (const c of out.run_locally) {
    if (detected.has(c.command)) commands.push(c.command);
    else dropped.commands += 1;
  }

  const grounded: ValidatedLlm['firstTasks'] = [];
  for (const t of out.first_tasks) {
    const files = t.files.filter((f) => ctx.indexPaths.has(f));
    dropped.paths += t.files.length - files.length;
    if (files.length === 0) {
      dropped.entries += 1;
      continue;
    }
    grounded.push({ title: t.title, rationale: t.rationale, files });
  }
  const firstTasks = grounded.slice(0, FIRST_TASKS_MAX);
  const tooFew = firstTasks.length < FIRST_TASKS_MIN;

  const md = neutralizeMarkdown(out.architecture.summary_markdown, ctx.indexPaths);
  const summary = md.text.trim();
  return {
    ok: true,
    value: {
      summaryMarkdown: summary.length > 0 ? summary : null,
      diagram: sanitizeDiagram(out.architecture.diagram),
      linkPaths: md.linkPaths,
      criticalRoles,
      readingReasons,
      commands,
      firstTasks: tooFew ? [] : firstTasks,
      firstTasksUnavailableReason: tooFew ? 'Fewer than 3 tasks cite real files' : null,
    },
    dropped,
  };
}

export function mergeTour(skeleton: OnboardingTour, v: ValidatedLlm): OnboardingTour {
  const a = skeleton.architecture;
  const hasArchFacts = a.stack.length + a.structure.length + a.routes.length > 0;
  const hasSummary = v.summaryMarkdown != null;
  return {
    ...skeleton,
    architecture: {
      ...a,
      state: hasSummary || hasArchFacts ? 'ok' : 'not_available',
      reason: hasSummary || hasArchFacts ? null : 'No stack, structure or routes detected',
      summary_markdown: v.summaryMarkdown ? clip(v.summaryMarkdown, 8000) : null,
      diagram: v.diagram,
    },
    critical_paths: {
      ...skeleton.critical_paths,
      items: skeleton.critical_paths.items.map((c) => {
        const role = v.criticalRoles[c.path];
        return role ? { ...c, role: clip(role, 500), role_source: 'llm' as const } : c;
      }),
    },
    reading_path: {
      ...skeleton.reading_path,
      items: skeleton.reading_path.items.map((r) => {
        const reason = v.readingReasons[r.path];
        return reason ? { ...r, reason: clip(reason, 500) } : r;
      }),
    },
    first_tasks:
      v.firstTasks.length > 0
        ? {
            state: 'ok',
            reason: null,
            items: v.firstTasks.map((t) => ({
              title: clip(t.title, 200),
              rationale: clip(t.rationale, 1000),
              files: t.files,
            })),
          }
        : {
            state: 'not_available',
            reason: v.firstTasksUnavailableReason ?? 'No tasks generated',
            items: [],
          },
    link_paths: v.linkPaths,
  };
}

// --- Errors & persistence (AC-15, AC-16, NFR-4, C1) --------------------------

export function classifyLlmError(err: unknown): 'invalid_output' | 'llm_unavailable' {
  const msg = err instanceof Error ? err.message : String(err);
  return /schema validation|failed schema/i.test(msg) ? 'invalid_output' : 'llm_unavailable';
}

/**
 * CONTENT-FREE diagnosis of a structured-output failure (NFR-5): never returns
 * any value text from the model output, only its length and failing field
 * paths + zod issue codes. `raw` is the adapter's `details.raw`.
 */
export function diagnoseInvalidOutput(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let json: unknown;
  try {
    json = JSON.parse(raw.trim());
  } catch {
    return clip(
      `output was not valid JSON (likely truncated at the output token limit); ${raw.length} chars`,
      MAX_ERROR_DETAIL_CHARS,
    );
  }
  const parsed = OnboardingLlmOutput.safeParse(json);
  if (parsed.success) return null;
  const items = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`);
  const more = parsed.error.issues.length - items.length;
  return clip(`schema mismatch at ${items.join(', ')}${more > 0 ? ` (+${more} more)` : ''}`, MAX_ERROR_DETAIL_CHARS);
}

/** `details.raw` of an adapter schema-validation error, if it carries one. */
export function rawOutputOf(err: unknown): unknown {
  const details = (err as { details?: unknown } | null)?.details;
  return typeof details === 'object' && details !== null ? (details as { raw?: unknown }).raw : undefined;
}

export function decidePersistence(
  stored: { status: 'generated' | 'skeleton' } | null,
  outcome: PersistOutcome,
): 'replace' | 'keep' {
  if (outcome.kind === 'failed') return 'keep';
  if (outcome.kind === 'generated') return 'replace';
  if (stored == null) return 'replace';
  const llmCaused = outcome.skeletonReason === 'llm_unavailable' || outcome.skeletonReason === 'invalid_output';
  if (llmCaused) return 'keep'; // a tour already exists
  // Index-caused skeleton: may replace a stored skeleton, never a generated tour.
  return stored.status === 'skeleton' ? 'replace' : 'keep';
}
