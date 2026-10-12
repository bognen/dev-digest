import type { CSSProperties } from "react";

export const s = {
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  task: {
    padding: "14px 16px",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  title: { margin: "0 0 6px", fontSize: 15, fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  rationale: { color: "var(--text-secondary)", lineHeight: 1.55 } satisfies CSSProperties,
  files: { listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  file: { display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" } satisfies CSSProperties,
  path: { fontSize: 13, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
};
