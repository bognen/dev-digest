import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--bg-surface)",
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  heading: { margin: 0 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "16px 20px",
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    textAlign: "left",
    cursor: "pointer",
  } satisfies CSSProperties,
  iconBox: {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 30,
    borderRadius: 8,
    background: "var(--accent-bg, var(--bg-hover))",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  title: { flex: 1, fontSize: 16, fontWeight: 650 } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)", display: "inline-flex" } satisfies CSSProperties,
  body: { padding: "0 20px 20px", fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  note: { margin: 0, color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
};
