import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  path: { fontSize: 13, fontWeight: 600, wordBreak: "break-all", flex: 1 } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: {
    padding: "16px 20px",
    fontSize: 14,
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  skeleton: { padding: 16, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
