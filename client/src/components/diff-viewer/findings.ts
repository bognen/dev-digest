/* Inline review-finding support for the DiffViewer (Files changed tab).
   Pure helpers + the render-prop contract the viewer needs; no hooks. The route
   supplies `renderFinding` so this shared component never imports a route's
   _components (FindingCard lives there). */
import type { ReactNode } from "react";
import type { Severity } from "@devdigest/ui";
import { lineKey } from "./comments";

/** One finding pinned to a new-side (RIGHT) line of a file. */
export interface FindingAnchor {
  id: string;
  line: number;
  severity: Severity;
}

/** What the viewer needs to show review findings inline. */
export interface DiffFindingApi {
  /** Findings for `path` (dismissed ones included — rendered muted). */
  anchorsFor: (path: string) => FindingAnchor[];
  /** True when `path` has at least one non-dismissed finding (drives the dot). */
  hasOpenFindings: (path: string) => boolean;
  /** Number of open (not dismissed) findings on a file — feeds group-header totals. */
  openFindingCount?: (path: string) => number;
  /** Per-finding collapsed state (inline card hidden, severity pill stays). */
  isHidden?: (id: string) => boolean;
  /** Show/hide the inline cards of these findings. */
  onToggleHidden?: (ids: string[]) => void;
  /** Render prop: the route supplies the finding card. */
  renderFinding: (id: string) => ReactNode;
}

/**
 * Split anchors into those that match a rendered new-side line (keyed
 * `RIGHT:<line>`) and ones whose line isn't in this patch. The unanchored
 * bucket is surfaced separately so no finding is silently dropped.
 */
export function partitionFindingAnchors(
  anchors: FindingAnchor[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingAnchor[]>; unanchored: FindingAnchor[] } {
  const matched = new Map<string, FindingAnchor[]>();
  const unanchored: FindingAnchor[] = [];
  for (const a of anchors) {
    const key = lineKey("RIGHT", a.line);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(a);
      matched.set(key, list);
    } else {
      unanchored.push(a);
    }
  }
  return { matched, unanchored };
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2, INFO: 3 };

/** Most severe of the anchors on one line (drives the single row pill). */
export function topSeverity(anchors: FindingAnchor[]): Severity {
  return anchors.reduce<Severity>(
    (best, a) => (SEVERITY_RANK[a.severity] < SEVERITY_RANK[best] ? a.severity : best),
    anchors[0]!.severity,
  );
}
