/** Pure focus-target logic for the DiffViewer. A route supplies the target
 *  through a plain `DiffFocusApi` object (src/components never imports a
 *  route's `_components`). No React / DOM here. */
import type { Line } from "./helpers";

export type DiffFocusTarget = { path: string; line: number | null; nonce: number };

export type DiffFocusApi = {
  target: DiffFocusTarget | null;
  noDiffLabel: string;
  targetMarkerLabel: string;
  /** True only the first time a given nonce is claimed. */
  claim(nonce: number): boolean;
};

export type FocusResolution =
  | { kind: "no_diff" }
  | { kind: "header" }
  | { kind: "line"; index: number }
  | { kind: "hunk"; index: number };

/** Resolve where a focus request lands inside one file's parsed patch. */
export function resolveFocusLine(lines: Line[], line: number | null): FocusResolution {
  if (lines.length === 0) return { kind: "no_diff" };
  if (line === null) return { kind: "header" };

  if (Number.isFinite(line)) {
    const exact = lines.findIndex((l) => l.kind !== "hunk" && l.newNo === line);
    if (exact !== -1) return { kind: "line", index: exact };
  }

  // Collect hunk headers with their new-side [min, max] range.
  const hunks: { index: number; min: number; max: number }[] = [];
  let cur: { index: number; min: number; max: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.kind === "hunk") {
      cur = { index: i, min: Infinity, max: -Infinity };
      hunks.push(cur);
      continue;
    }
    if (cur && l.newNo !== undefined) {
      if (l.newNo < cur.min) cur.min = l.newNo;
      if (l.newNo > cur.max) cur.max = l.newNo;
    }
  }
  if (hunks.length === 0) return { kind: "header" };

  if (!Number.isFinite(line)) return { kind: "hunk", index: hunks[0]!.index };

  let best: { index: number; dist: number } | null = null;
  for (const h of hunks) {
    if (h.min === Infinity) continue;
    const dist = line < h.min ? h.min - line : line > h.max ? line - h.max : 0;
    if (best === null || dist < best.dist) best = { index: h.index, dist };
  }
  // Deleted-file patches have no new-side numbers: fall back to the first hunk.
  return { kind: "hunk", index: best ? best.index : hunks[0]!.index };
}

/** Honour `prefers-reduced-motion` for programmatic scrolling. */
export function scrollBehaviorFor(
  win: { matchMedia?: (q: string) => { matches: boolean } } | undefined,
): ScrollBehavior {
  if (win && typeof win.matchMedia === "function") {
    return win.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  }
  return "smooth";
}
