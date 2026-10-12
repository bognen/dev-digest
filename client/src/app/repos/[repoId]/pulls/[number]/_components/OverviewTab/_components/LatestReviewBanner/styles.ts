import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 24,
  } satisfies CSSProperties,
  notice: {
    margin: 0,
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,
};
