import type { BlastCaller, DownstreamImpact } from "@devdigest/shared";
import {
  GRAPH_COLUMNS,
  GRAPH_GROUP_GAP,
  GRAPH_PAD,
  GRAPH_ROW_HEIGHT,
  MAX_GRAPH_CALLERS,
} from "./constants";

/** One changed symbol and its downstream impact, as fed to the layout. */
export interface GraphSymbolInput {
  key: string;
  name: string;
  group?: DownstreamImpact;
}

export type GraphTargetKind = "endpoint" | "cron";

/** A positioned node; `y` is the vertical centre. */
export interface GraphNode {
  id: string;
  label: string;
  /** Full, untruncated text for the tooltip. */
  title: string;
  y: number;
}

export interface GraphCallerNode extends GraphNode {
  caller: BlastCaller;
}

export interface GraphMoreNode extends GraphNode {
  hidden: number;
}

export interface GraphTargetNode extends GraphNode {
  kind: GraphTargetKind;
}

export interface GraphEdge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GraphLayout {
  symbols: GraphNode[];
  callers: GraphCallerNode[];
  more: GraphMoreNode[];
  targets: GraphTargetNode[];
  edges: GraphEdge[];
  height: number;
}

/** Shorten `label` to at most `max` characters, marking the cut with an ellipsis.
 *  `keep: "end"` retains the tail (file paths: the basename matters most). */
export function truncateLabel(label: string, max: number, keep: "start" | "end" = "start"): string {
  if (max < 1 || label.length <= max) return label;
  if (max === 1) return "\u2026";
  return keep === "start" ? `${label.slice(0, max - 1)}\u2026` : `\u2026${label.slice(label.length - (max - 1))}`;
}

/** `file:line` caller label. */
export function callerLabel(c: Pick<BlastCaller, "file" | "line">): string {
  return `${c.file}:${c.line}`;
}

/** Cubic bezier path (horizontal tangents) for an edge. */
export function edgePath(e: Pick<GraphEdge, "x1" | "y1" | "x2" | "y2">): string {
  const mid = (e.x1 + e.x2) / 2;
  return `M ${e.x1} ${e.y1} C ${mid} ${e.y1}, ${mid} ${e.y2}, ${e.x2} ${e.y2}`;
}

/** True when there is nothing to draw: no symbol has a caller. */
export function isGraphEmpty(symbols: GraphSymbolInput[]): boolean {
  return !symbols.some((s) => (s.group?.callers.length ?? 0) > 0);
}

/**
 * Three-column layout: symbols (left) -> callers (middle, first `maxCallers` per
 * symbol plus a "+k more" node) -> endpoints/crons (right, deduped). Symbols
 * without callers are skipped. Pure: same input, same coordinates.
 */
export function buildGraphLayout(symbols: GraphSymbolInput[], maxCallers: number = MAX_GRAPH_CALLERS): GraphLayout {
  const cap = Math.max(1, Math.floor(maxCallers));
  const symbolX = GRAPH_COLUMNS.symbol.x + GRAPH_COLUMNS.symbol.width;
  const callerLeft = GRAPH_COLUMNS.caller.x;
  const callerRight = GRAPH_COLUMNS.caller.x + GRAPH_COLUMNS.caller.width;
  const targetLeft = GRAPH_COLUMNS.target.x;

  const out: GraphLayout = { symbols: [], callers: [], more: [], targets: [], edges: [], height: 0 };
  const targetAnchors = new Map<string, { kind: GraphTargetKind; label: string; ys: number[] }>();
  const groupEdges: { symbolY: number; targetId: string }[] = [];

  let cursor = GRAPH_PAD;
  for (const sym of symbols) {
    const group = sym.group;
    if (!group || group.callers.length === 0) continue;

    const shown = group.callers.slice(0, cap);
    const hidden = group.callers.length - shown.length;
    const slots = shown.length + (hidden > 0 ? 1 : 0);
    const top = cursor;
    const symbolY = top + (slots * GRAPH_ROW_HEIGHT) / 2;

    out.symbols.push({ id: `s:${sym.key}`, label: sym.name, title: sym.name, y: symbolY });

    shown.forEach((caller, i) => {
      const y = top + i * GRAPH_ROW_HEIGHT + GRAPH_ROW_HEIGHT / 2;
      const id = `c:${sym.key}:${i}`;
      out.callers.push({ id, label: callerLabel(caller), title: `${callerLabel(caller)} (${caller.name})`, y, caller });
      out.edges.push({ id: `e:${id}`, x1: symbolX, y1: symbolY, x2: callerLeft, y2: y });
    });
    if (hidden > 0) {
      const y = top + shown.length * GRAPH_ROW_HEIGHT + GRAPH_ROW_HEIGHT / 2;
      const id = `m:${sym.key}`;
      out.more.push({ id, label: "", title: "", y, hidden });
      out.edges.push({ id: `e:${id}`, x1: symbolX, y1: symbolY, x2: callerLeft, y2: y });
    }

    const targets: [GraphTargetKind, string][] = [
      ...group.endpoints_affected.map((e): [GraphTargetKind, string] => ["endpoint", e]),
      ...group.crons_affected.map((c): [GraphTargetKind, string] => ["cron", c]),
    ];
    for (const [kind, label] of targets) {
      const id = `t:${kind}:${label}`;
      const entry = targetAnchors.get(id) ?? { kind, label, ys: [] };
      entry.ys.push(symbolY);
      targetAnchors.set(id, entry);
      groupEdges.push({ symbolY, targetId: id });
    }

    cursor = top + slots * GRAPH_ROW_HEIGHT + GRAPH_GROUP_GAP;
  }

  // Targets sit at the mean y of the groups reaching them, pushed down to avoid overlap.
  const ordered = [...targetAnchors.entries()]
    .map(([id, t]) => ({ id, ...t, want: t.ys.reduce((a, b) => a + b, 0) / t.ys.length }))
    .sort((a, b) => a.want - b.want);
  let prev = -Infinity;
  const targetY = new Map<string, number>();
  for (const t of ordered) {
    const y = Math.max(t.want, prev + GRAPH_ROW_HEIGHT);
    prev = y;
    targetY.set(t.id, y);
    out.targets.push({ id: t.id, label: t.label, title: t.label, kind: t.kind, y });
  }
  for (const ge of groupEdges) {
    out.edges.push({
      id: `e:${ge.symbolY}:${ge.targetId}`,
      x1: callerRight,
      y1: ge.symbolY,
      x2: targetLeft,
      y2: targetY.get(ge.targetId) ?? ge.symbolY,
    });
  }

  const callersBottom = out.symbols.length > 0 ? cursor - GRAPH_GROUP_GAP : GRAPH_PAD;
  const targetsBottom = prev === -Infinity ? 0 : prev + GRAPH_ROW_HEIGHT / 2;
  out.height = Math.max(callersBottom, targetsBottom) + GRAPH_PAD;
  return out;
}
