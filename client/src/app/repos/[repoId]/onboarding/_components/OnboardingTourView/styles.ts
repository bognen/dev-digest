import type { CSSProperties } from "react";

export const s = {
  page: { padding: "28px 32px", maxWidth: 1240, margin: "0 auto" } satisfies CSSProperties,
  layout: { display: "flex", alignItems: "flex-start", gap: 40 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  sections: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    marginBottom: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  error: {
    padding: "12px 14px",
    marginBottom: 16,
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    fontSize: 13,
    color: "var(--text-primary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
};
