import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
};

export function optionFor(active: boolean): CSSProperties {
  return {
    border: "none",
    padding: "5px 12px",
    fontSize: 12.5,
    fontWeight: 500,
    cursor: "pointer",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    background: active ? "var(--accent-bg)" : "transparent",
  };
}
