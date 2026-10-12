import type { CSSProperties } from "react";

export const s = {
  prose: { marginBottom: 16, color: "var(--text-secondary)", lineHeight: 1.6 } satisfies CSSProperties,
  subheading: {
    margin: "20px 0 8px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  strong: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
};
