/* eval-format.ts — pure helpers for the SPEC-06 eval views: metric formatting,
   deltas, prompt line diff, case-set diff, expectation summaries and parsing a
   pasted unified diff into PrFile[] for the DiffViewer preview. No React. */
import type {
  EvalCaseDetail,
  EvalCaseResult,
  EvalConfigSnapshot,
  EvalExpectedOutput,
  EvalSuiteRun,
  PrFile,
} from "@devdigest/shared";

export type MetricKey = "recall" | "precision" | "citation_accuracy";
export const METRIC_KEYS: readonly MetricKey[] = ["recall", "precision", "citation_accuracy"];

/** 0.823 → "82%". Null → "—". */
export function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/** Metric value as shown: "n/a" when the denominator was zero (AC-24). */
export function metricText(run: Pick<EvalSuiteRun, MetricKey | "vacuous">, key: MetricKey): string {
  if (run.vacuous?.[key]) return "n/a";
  return pct(run[key]);
}

/** Signed delta in whole points: 0.04 → 4, -0.02 → -2. */
export function deltaPts(from: number | null | undefined, to: number | null | undefined): number {
  return Math.round(((to ?? 0) - (from ?? 0)) * 100);
}

/** "▲ 4pt" / "▼ 2pt" / "± 0pt". */
export function deltaLabel(points: number): string {
  if (points > 0) return `▲ ${points}pt`;
  if (points < 0) return `▼ ${-points}pt`;
  return "± 0pt";
}

/** Cost delta: "▲ 0.02" / "▼ 0.01" / "± 0.00"; null when either side is unknown. */
export function costDeltaLabel(from: number | null, to: number | null): string | null {
  if (from == null || to == null) return null;
  const d = Math.round((to - from) * 100) / 100;
  if (d > 0) return `▲ ${d.toFixed(2)}`;
  if (d < 0) return `▼ ${(-d).toFixed(2)}`;
  return "± 0.00";
}

export function money(v: number | null | undefined): string {
  if (v == null) return "—";
  return v < 0.01 && v > 0 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

/** "2026-05-29 09:14" in local time. */
export function runTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Prompt diff (AC-30)
// ---------------------------------------------------------------------------

export type DiffLineKind = "same" | "removed" | "added";
export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/** Line-level LCS diff of two texts (old → new). */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "removed", text: a[i++]! });
    } else {
      out.push({ kind: "added", text: b[j++]! });
    }
  }
  while (i < n) out.push({ kind: "removed", text: a[i++]! });
  while (j < m) out.push({ kind: "added", text: b[j++]! });
  return out;
}

/** Non-prompt config differences between two snapshots (AC-30), as "label: old → new". */
export function configChanges(a: EvalConfigSnapshot, b: EvalConfigSnapshot): string[] {
  const out: string[] = [];
  if (a.provider !== b.provider || a.model !== b.model) {
    out.push(`model: ${a.provider}/${a.model} → ${b.provider}/${b.model}`);
  }
  if (a.strategy !== b.strategy) out.push(`strategy: ${a.strategy} → ${b.strategy}`);
  const skills = (s: EvalConfigSnapshot) => s.skills.map((k) => `${k.name}@v${k.version}`).join(", ") || "none";
  if (skills(a) !== skills(b)) out.push(`skills: ${skills(a)} → ${skills(b)}`);
  return out;
}

/** Case ids added / removed between the old and new run (AC-32). */
export function caseSetDiff(oldIds: string[], newIds: string[]): { added: number; removed: number } {
  const o = new Set(oldIds);
  const n = new Set(newIds);
  return {
    added: [...n].filter((id) => !o.has(id)).length,
    removed: [...o].filter((id) => !n.has(id)).length,
  };
}

/** Per-case outcome flips between two runs (AC-31), matched by case id (or name for deleted cases). */
export function caseFlips(
  oldResults: EvalCaseResult[],
  newResults: EvalCaseResult[],
): { name: string; from: string; to: string }[] {
  const key = (r: EvalCaseResult) => r.case_id ?? `name:${r.case_name}`;
  const before = new Map(oldResults.map((r) => [key(r), r]));
  const flips: { name: string; from: string; to: string }[] = [];
  for (const r of newResults) {
    const prev = before.get(key(r));
    if (prev && prev.status !== r.status) flips.push({ name: r.case_name, from: prev.status, to: r.status });
  }
  return flips;
}

/** Order two runs old → new by start time, whatever order they were selected in. */
export function orderRuns<T extends Pick<EvalSuiteRun, "started_at">>(a: T, b: T): [T, T] {
  return a.started_at <= b.started_at ? [a, b] : [b, a];
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export type ExpectationSummary =
  | { kind: "must_find"; severity: string | null; category: string | null }
  | { kind: "must_not_flag" }
  | { kind: "clean" };

/** What a case asserts, for the row tag (AC-9). */
export function expectationSummary(expected: EvalExpectedOutput): ExpectationSummary {
  const list = expected.expectations;
  if (list.length === 0) return { kind: "clean" };
  const mf = list.find((e) => e.type === "must_find");
  if (mf) return { kind: "must_find", severity: mf.severity ?? null, category: mf.category ?? null };
  return { kind: "must_not_flag" };
}

/** Passed cases of the latest full run, counted from the case rows' last results. */
export function passingCount(cases: EvalCaseDetail[]): number {
  return cases.filter((c) => c.last_result?.status === "pass").length;
}

// ---------------------------------------------------------------------------
// Pasted diff → PrFile[] (DiffViewer preview)
// ---------------------------------------------------------------------------

/** Split a unified diff into PrFile entries (patch = hunks only), for the preview. */
export function diffToPrFiles(raw: string): PrFile[] {
  const files: PrFile[] = [];
  let cur: { path: string; lines: string[]; additions: number; deletions: number } | null = null;
  let inHunk = false;
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const flush = () => {
    if (cur && cur.path) {
      files.push({ path: cur.path, additions: cur.additions, deletions: cur.deletions, patch: cur.lines.join("\n") });
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("diff --git ") || (line.startsWith("--- ") && (lines[i + 1] ?? "").startsWith("+++ ") && inHunk)) {
      flush();
      cur = { path: "", lines: [], additions: 0, deletions: 0 };
      inHunk = false;
      if (line.startsWith("diff --git ")) continue;
    }
    if (line.startsWith("+++ ") && !inHunk) {
      cur ??= { path: "", lines: [], additions: 0, deletions: 0 };
      cur.path = line.slice(4).trim().replace(/^b\//, "");
      continue;
    }
    if (line.startsWith("--- ") && !inHunk) {
      cur ??= { path: "", lines: [], additions: 0, deletions: 0 };
      continue;
    }
    if (line.startsWith("@@")) inHunk = true;
    if (!inHunk || !cur) continue;
    cur.lines.push(line);
    if (line.startsWith("+")) cur.additions++;
    else if (line.startsWith("-")) cur.deletions++;
  }
  flush();
  return files;
}
