import type { CSSProperties } from "react";

export const s = {
  nav: { position: "sticky", top: 16, width: 200, flexShrink: 0 } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 12,
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  item: {
    display: "block",
    padding: "8px 14px",
    borderLeft: "2px solid transparent",
    color: "var(--text-secondary)",
    fontSize: 14,
    textDecoration: "none",
  } satisfies CSSProperties,
  itemActive: {
    borderLeftColor: "var(--accent)",
    color: "var(--text-primary)",
    fontWeight: 600,
  } satisfies CSSProperties,
};
