/** Max callers drawn per changed symbol; the rest collapse into a "+k more" node.
 *  A readability cap for the graph view — independent of any server-side limit. */
export const MAX_GRAPH_CALLERS = 5;

export const GRAPH_WIDTH = 760;
export const GRAPH_PAD = 12;
export const GRAPH_ROW_HEIGHT = 26;
export const GRAPH_NODE_HEIGHT = 20;
export const GRAPH_NODE_RADIUS = 4;
export const GRAPH_TEXT_PAD = 8;
/** Vertical gap between two symbols' caller blocks. */
export const GRAPH_GROUP_GAP = 14;

/** Left edge and width of each column. */
export const GRAPH_COLUMNS = {
  symbol: { x: GRAPH_PAD, width: 200 },
  caller: { x: 270, width: 250 },
  target: { x: 580, width: GRAPH_WIDTH - 580 - GRAPH_PAD },
} as const;

/** Max visible characters per column label before it is truncated with an ellipsis. */
export const GRAPH_MAX_CHARS = { symbol: 26, caller: 34, target: 22 } as const;
