import type { CSSProperties } from "react";

export const s = {
  header: { marginBottom: 20 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  heading: { fontSize: 26, fontWeight: 700, flex: 1, margin: 0 } satisfies CSSProperties,
  repoName: { color: "var(--accent)", fontWeight: 700 } satisfies CSSProperties,
  meta: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.5 } satisfies CSSProperties,
  status: { marginTop: 10 } satisfies CSSProperties,
  failure: {
    marginTop: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
};
