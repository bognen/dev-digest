import type { CSSProperties } from "react";

/** Co-located styles for BlastRadiusCard. */
export const s = {
  // Same label-row height in Intent and Blast Radius (Intent's optional badge makes its
  // row taller) so the two panels below start on one line.
  labelRow: { minHeight: 37 } satisfies CSSProperties,
  root: { display: "flex", flexDirection: "column", flex: 1 } satisfies CSSProperties,
  loadingStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    lineHeight: 1.45,
    marginBottom: 12,
  } satisfies CSSProperties,
  panel: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "14px 16px",
    flex: 1,
  } satisfies CSSProperties,
  statsLine: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 10,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  statAccent: {
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  // Fixed height, scrolls inside the panel — same footprint as the Intent card
  // beside it, however many symbols a large PR changes.
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    maxHeight: 360,
    overflowY: "auto",
  } satisfies CSSProperties,
  item: {
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  row: (expandable: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 8,
      width: "100%",
      padding: "9px 4px",
      background: "none",
      border: "none",
      font: "inherit",
      color: "inherit",
      textAlign: "left",
      cursor: expandable ? "pointer" : "default",
    }) satisfies CSSProperties,
  chevron: (open: boolean, expandable: boolean) =>
    ({
      flexShrink: 0,
      color: "var(--text-muted)",
      opacity: expandable ? 1 : 0.5,
      transform: open ? "rotate(90deg)" : "none",
      transition: "transform 0.12s ease",
    }) satisfies CSSProperties,
  symbolName: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  callerCount: {
    flexShrink: 0,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  detail: {
    padding: "0 4px 10px 28px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  callerList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  // Truncates the file:line link instead of letting its unbreakable path
  // text set the flex item's min-content width — without this, one long
  // path forces the whole card (and its grid column) wider. Full path is
  // still available via the `title` tooltip on the wrapping span.
  callerLinkWrap: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  callerSymbol: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  factsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  } satisfies CSSProperties,
} as const;
