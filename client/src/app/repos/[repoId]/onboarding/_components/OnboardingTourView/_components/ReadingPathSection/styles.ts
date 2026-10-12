import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "flex-start", gap: 12 } satisfies CSSProperties,
  badge: {
    display: "grid",
    placeItems: "center",
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: 99,
    background: "var(--bg-hover)",
    color: "var(--accent-text)",
    fontSize: 13,
    fontWeight: 600,
  } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  path: { color: "var(--text-primary)" } satisfies CSSProperties,
  reason: { color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  hotness: { margin: "14px 0 0", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
};
