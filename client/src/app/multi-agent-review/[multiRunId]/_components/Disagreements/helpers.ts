/**
 * Pure grouping + conflict classification for the "Where agents disagree"
 * section. Computed client-side from the multi-run payload; never writes (AC-14).
 * No React, no I/O.
 */
import { NEARBY_LINES, SEVERITY_RANK, TITLE_SIMILARITY_THRESHOLD } from "./constants";

/** The subset of a finding the grouping needs (structural; satisfied by FindingRecord). */
export interface GroupableFinding {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
}

/** The subset of a multi-run child the grouping needs (satisfied by MultiRunChild). */
export interface GroupableChild {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  status: string;
  findings: GroupableFinding[];
}

export type DisagreementCell =
  | { kind: "status"; runId: string; agentId: string | null; agentName: string | null; status: string }
  | {
      kind: "flagged";
      runId: string;
      agentId: string | null;
      agentName: string | null;
      /** The agent's highest severity within the group. */
      severity: string;
      /** How many of the agent's findings are in the group. */
      count: number;
      findings: GroupableFinding[];
    }
  | { kind: "did-not-flag"; runId: string; agentId: string | null; agentName: string | null };

export interface DisagreementRow {
  /** Stable key: the lexicographically smallest finding id in the group. */
  key: string;
  file: string;
  /** Earliest start line among the group's findings. */
  line: number;
  /** Title of the highest-severity finding (ties: higher confidence). */
  title: string;
  isConflict: boolean;
  /** One cell per child run, in selection (payload) order. */
  cells: DisagreementCell[];
}

/* normalizePath / rangesOverlap are copied (not imported) from
   server/src/modules/eval/pipeline/scoring.ts: the server's eval module is
   private and the client cannot import server code. Keep behavior identical. */

/** Strip a leading `./`, `a/` or `b/` (git diff prefixes). */
export function normalizePath(p: string): string {
  let s = p.trim().replace(/\\/g, "/");
  if (s.startsWith("./")) s = s.slice(2);
  else if (s.startsWith("a/") || s.startsWith("b/")) s = s.slice(2);
  return s;
}

/** Inclusive overlap of [aStart, aEnd] and [bStart, bEnd]; reversed ranges are normalised. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const aLo = Math.min(aStart, aEnd);
  const aHi = Math.max(aStart, aEnd);
  const bLo = Math.min(bStart, bEnd);
  const bHi = Math.max(bStart, bEnd);
  return aLo <= bHi && bLo <= aHi;
}

/** Lines between two ranges; 0 when they overlap. Reversed ranges are normalised. */
export function lineGap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const aLo = Math.min(aStart, aEnd);
  const aHi = Math.max(aStart, aEnd);
  const bLo = Math.min(bStart, bEnd);
  const bHi = Math.max(bStart, bEnd);
  return Math.max(0, bLo - aHi, aLo - bHi);
}

/** Lower-cased word tokens of a title (Unicode letters/digits); never throws. */
export function titleTokens(title: string): Set<string> {
  const out = new Set<string>();
  for (const tok of String(title ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (tok) out.add(tok);
  }
  return out;
}

/** Jaccard similarity of two sets; two empty sets -> 0. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const rank = (severity: string): number => SEVERITY_RANK[severity] ?? 0;

interface Item {
  f: GroupableFinding;
  childIndex: number;
  path: string;
  tokens: Set<string>;
}

interface GroupMember {
  f: GroupableFinding;
  childIndex: number;
}

/**
 * Groups = connected components of the pairwise match relation over findings of
 * DIFFERENT children, same normalized path, and either
 *   - inclusive line overlap AND (same category OR title Jaccard >= threshold), or
 *   - a line gap <= NEARBY_LINES AND title Jaccard >= threshold (one defect
 *     anchored on different lines by different agents).
 * Bucketed by path first so the pair scan stays small. Membership is
 * input-order independent.
 */
export function groupFindings(
  children: GroupableChild[],
  threshold: number = TITLE_SIMILARITY_THRESHOLD,
): GroupMember[][] {
  const items: Item[] = [];
  children.forEach((c, childIndex) => {
    for (const f of c.findings) {
      items.push({ f, childIndex, path: normalizePath(f.file), tokens: titleTokens(f.title) });
    }
  });

  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[i] !== r) {
      const next = parent[i]!;
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const buckets = new Map<string, number[]>();
  items.forEach((it, i) => {
    const b = buckets.get(it.path);
    if (b) b.push(i);
    else buckets.set(it.path, [i]);
  });

  for (const idxs of buckets.values()) {
    for (let x = 0; x < idxs.length; x++) {
      const a = items[idxs[x]!]!;
      for (let y = x + 1; y < idxs.length; y++) {
        const b = items[idxs[y]!]!;
        if (a.childIndex === b.childIndex) continue;
        const similar = jaccard(a.tokens, b.tokens) >= threshold;
        const overlap = rangesOverlap(a.f.start_line, a.f.end_line, b.f.start_line, b.f.end_line);
        const nearby =
          lineGap(a.f.start_line, a.f.end_line, b.f.start_line, b.f.end_line) <= NEARBY_LINES;
        if ((overlap && (a.f.category === b.f.category || similar)) || (nearby && similar)) {
          union(idxs[x]!, idxs[y]!);
        }
      }
    }
  }

  const comps = new Map<number, GroupMember[]>();
  items.forEach((it, i) => {
    const r = find(i);
    const entry = { f: it.f, childIndex: it.childIndex };
    const g = comps.get(r);
    if (g) g.push(entry);
    else comps.set(r, [entry]);
  });
  return [...comps.values()];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Highest severity first, then higher confidence, then id (total order). */
function headlineCompare(a: GroupableFinding, b: GroupableFinding): number {
  return rank(b.severity) - rank(a.severity) || b.confidence - a.confidence || cmp(a.id, b.id);
}

/**
 * One row per group. Cells follow the children's order. Only `done` children
 * count toward conflict classification (AC-70); a non-done child's cell shows
 * its status (AC-75). Rows are sorted by path, then line.
 */
export function buildDisagreementRows(
  children: GroupableChild[],
  threshold: number = TITLE_SIMILARITY_THRESHOLD,
): DisagreementRow[] {
  const rows = groupFindings(children, threshold).map((group): DisagreementRow => {
    const headline = group.map((g) => g.f).sort(headlineCompare)[0]!;
    const line = Math.min(...group.map((g) => g.f.start_line));
    const key = group.map((g) => g.f.id).reduce((m, id) => (id < m ? id : m));

    const cells: DisagreementCell[] = [];
    const flaggerSeverities = new Set<string>();
    let doneCount = 0;
    let flaggedDone = 0;

    children.forEach((c, childIndex) => {
      const base = { runId: c.run_id, agentId: c.agent_id, agentName: c.agent_name };
      if (c.status !== "done") {
        cells.push({ kind: "status", ...base, status: c.status });
        return;
      }
      doneCount++;
      const mine = group
        .filter((g) => g.childIndex === childIndex)
        .map((g) => g.f)
        .sort(headlineCompare);
      if (mine.length === 0) {
        cells.push({ kind: "did-not-flag", ...base });
        return;
      }
      flaggedDone++;
      const severity = mine[0]!.severity;
      flaggerSeverities.add(severity);
      cells.push({ kind: "flagged", ...base, severity, count: mine.length, findings: mine });
    });

    const isConflict = flaggedDone > 0 && (flaggedDone < doneCount || flaggerSeverities.size > 1);

    return { key, file: normalizePath(headline.file), line, title: headline.title, isConflict, cells };
  });

  return rows.sort((a, b) => cmp(a.file, b.file) || a.line - b.line || cmp(a.key, b.key));
}
