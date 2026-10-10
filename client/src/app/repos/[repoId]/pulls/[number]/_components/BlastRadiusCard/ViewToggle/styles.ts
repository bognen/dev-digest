import type { CSSProperties } from "react";

/** Co-located styles for ViewToggle. */
export const s = {
  group: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
  button: (active: boolean) =>
    ({
      padding: "3px 10px",
      font: "inherit",
      fontSize: 12,
      textTransform: "capitalize",
      border: "none",
      cursor: "pointer",
      background: active ? "var(--accent-bg)" : "transparent",
      color: active ? "var(--accent-text)" : "var(--text-muted)",
    }) satisfies CSSProperties,
} as const;
