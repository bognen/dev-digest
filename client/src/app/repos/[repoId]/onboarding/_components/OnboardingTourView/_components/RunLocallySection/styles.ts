import type { CSSProperties } from "react";

export const s = {
  notice: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "0 0 12px",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-base, var(--bg-elevated))",
  } satisfies CSSProperties,
  index: { width: 16, fontSize: 12, color: "var(--text-muted)", textAlign: "right" } satisfies CSSProperties,
  cmdWrap: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  code: {
    display: "block",
    fontSize: 13,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  source: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  copied: { fontSize: 12, color: "var(--text-secondary)", minWidth: 48, textAlign: "right" } satisfies CSSProperties,
};
