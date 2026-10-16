import type { CSSProperties } from "react";

/** Co-located styles for PreviousRuns (matches AgentPickCard's card look). */
export const s = {
  section: {
    marginTop: 36,
    paddingTop: 22,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  h2: { fontSize: 13.5, fontWeight: 600, marginBottom: 10 } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "11px 14px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  main: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  pr: {
    fontSize: 13,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  agents: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginTop: 3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  side: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
  } satisfies CSSProperties,
  findings: { fontSize: 12, fontWeight: 600 } satisfies CSSProperties,
  meta: { fontSize: 10.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  empty: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
} as const;
