import type { CSSProperties } from "react";

export const s = {
  // Same label-row height in Intent and Blast Radius (Intent's optional badge makes its
  // row taller) so the two panels below start on one line.
  labelRow: { minHeight: 37 } satisfies CSSProperties,
  // The section fills its grid cell so the card stretches to match the Blast Radius
  // panel beside it (equal top edge + equal height).
  root: { display: "flex", flexDirection: "column", flex: 1 } satisfies CSSProperties,
  card: (lowConfidence: boolean): CSSProperties => ({
    border: "1px solid",
    borderStyle: lowConfidence ? "dashed" : "solid",
    borderColor: lowConfidence ? "var(--warn)" : "var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    flex: 1,
  }),
  statement: {
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.55,
    margin: 0,
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  } satisfies CSSProperties,
  columnLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  bulletList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    margin: 0,
    padding: 0,
    listStyle: "none",
  } satisfies CSSProperties,
  bulletItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  bulletIcon: (color: string): CSSProperties => ({
    color,
    marginTop: 2,
    flexShrink: 0,
  }),
  muted: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  whyLine: {
    fontSize: 12,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  actionHint: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  footerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  inlineNote: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
} as const;
