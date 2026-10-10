import type { CSSProperties } from "react";

/** Co-located styles for BlastGraph (SVG presentation props keyed off theme CSS vars). */
export const s = {
  wrap: { overflowX: "auto", maxHeight: 420, overflowY: "auto" } satisfies CSSProperties,
  wrapExpanded: { overflowX: "auto", overflowY: "auto" } satisfies CSSProperties,
  svg: { display: "block", width: "100%", minWidth: 560, height: "auto" } satisfies CSSProperties,
  empty: { fontSize: 12.5, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
  edge: { fill: "none", stroke: "var(--text-muted)", strokeOpacity: 0.45, strokeWidth: 1 },
  node: { fill: "var(--bg-base)", stroke: "var(--border)", strokeWidth: 1 },
  symbolNode: { fill: "var(--bg-base)", stroke: "var(--text-muted)", strokeWidth: 1 },
  endpointNode: { fill: "var(--accent-bg)", stroke: "var(--accent-text)", strokeWidth: 1 },
  cronNode: { fill: "var(--bg-base)", stroke: "var(--text-secondary)", strokeWidth: 1 },
  symbolText: { fill: "var(--text-primary)", fontSize: 12, fontWeight: 600 },
  callerText: { fill: "var(--text-secondary)", fontSize: 11.5 },
  linkText: { fill: "var(--accent-text)", fontSize: 11.5, textDecoration: "underline" },
  moreText: { fill: "var(--text-muted)", fontSize: 11.5, fontStyle: "italic" },
  endpointText: { fill: "var(--accent-text)", fontSize: 11.5 },
  cronText: { fill: "var(--text-secondary)", fontSize: 11.5 },
} as const;
