import type { CSSProperties } from "react";

export const s = {
  link: {
    flexShrink: 0,
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
  } satisfies CSSProperties,
};
