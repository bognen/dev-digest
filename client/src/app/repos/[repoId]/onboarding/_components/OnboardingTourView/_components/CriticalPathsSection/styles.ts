import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  path: { color: "var(--text-primary)" } satisfies CSSProperties,
  role: { color: "var(--text-secondary)" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
};
