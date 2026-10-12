import type { CSSProperties } from "react";

export const s = {
  note: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    marginBottom: 16,
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--bg-surface)",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
};
