/* Pure helpers for the DiffTab (no React, no hooks). */
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import type { FindingAnchor } from "@/components/diff-viewer";
import { FALLBACK_ROLE } from "./constants";

/** A smart-diff group rebuilt from the PR's real files (which carry the patches). */
export interface MergedGroup {
  role: SmartDiffRole;
  files: PrFile[];
  /** Paths the smart-diff flagged with finding lines. */
  flaggedPaths: ReadonlySet<string>;
}

/**
 * Smart order + roles come from the smart-diff; patches come from `prFiles`.
 * PR files the smart-diff doesn't know are appended to the core group; smart-diff
 * paths absent from the PR are dropped. Empty groups are omitted.
 */
export function mergeSmartOrder(prFiles: PrFile[], smartDiff: SmartDiff): MergedGroup[] {
  const byPath = new Map(prFiles.map((f) => [f.path, f]));
  const seen = new Set<string>();
  const groups: MergedGroup[] = [];
  for (const g of smartDiff.groups) {
    const files: PrFile[] = [];
    const flagged = new Set<string>();
    for (const sf of g.files) {
      const file = byPath.get(sf.path);
      if (!file || seen.has(sf.path)) continue;
      seen.add(sf.path);
      files.push(file);
      if (sf.finding_lines.length > 0) flagged.add(sf.path);
    }
    groups.push({ role: g.role, files, flaggedPaths: flagged });
  }
  const missing = prFiles.filter((f) => !seen.has(f.path));
  if (missing.length > 0) {
    const core = groups.find((g) => g.role === FALLBACK_ROLE);
    if (core) core.files.push(...missing);
    else groups.unshift({ role: FALLBACK_ROLE, files: missing, flaggedPaths: new Set() });
  }
  return groups.filter((g) => g.files.length > 0);
}

/** Rendered files in the group that the smart-diff flagged with finding lines. */
export function filesWithFindingsCount(group: MergedGroup): number {
  return group.files.filter((f) => group.flaggedPaths.has(f.path)).length;
}

/**
 * Latest findings per file path. Mirrors the server: only `kind === 'review'`
 * reviews, newest first, one review per `agent_id ?? id`; only plain findings
 * (kind null / 'finding'). Dismissed findings are KEPT (rendered muted inline);
 * use `hasOpenFinding` for the "open" dot.
 */
export function latestOpenFindingsByPath(reviews: ReviewRecord[]): Map<string, FindingRecord[]> {
  const sorted = reviews
    .filter((r) => r.kind === "review")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const seenAgents = new Set<string>();
  const byPath = new Map<string, FindingRecord[]>();
  for (const r of sorted) {
    const key = r.agent_id ?? r.id;
    if (seenAgents.has(key)) continue;
    seenAgents.add(key);
    for (const f of r.findings) {
      if (f.kind != null && f.kind !== "finding") continue;
      const list = byPath.get(f.file) ?? [];
      list.push(f);
      byPath.set(f.file, list);
    }
  }
  return byPath;
}

/** Findings → viewer anchors (new-side start line). */
export function toAnchors(findings: FindingRecord[] | undefined): FindingAnchor[] {
  return (findings ?? []).map((f) => ({ id: f.id, line: f.start_line, severity: f.severity }));
}

/** A finding counts as open until it is dismissed. */
export function hasOpenFinding(findings: FindingRecord[] | undefined): boolean {
  return (findings ?? []).some((f) => !f.dismissed_at);
}
