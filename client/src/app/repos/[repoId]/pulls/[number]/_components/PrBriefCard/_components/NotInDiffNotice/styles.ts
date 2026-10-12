import type { CSSProperties } from "react";

export const s = {
  notice: {
    display: "inline-flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginLeft: 8,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
