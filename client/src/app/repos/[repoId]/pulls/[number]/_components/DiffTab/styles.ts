import type { CSSProperties } from "react";

/** Co-located styles for the DiffTab. */
export const s = {
  controls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    margin: "0 0 12px",
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  notice: {
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 7,
    padding: "10px 12px",
    margin: "0 0 12px",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  noticeTitle: { fontWeight: 600, marginBottom: 2 } satisfies CSSProperties,
  noticeBody: { color: "var(--text-secondary)" } satisfies CSSProperties,
  noticeList: { margin: "6px 0 0", paddingLeft: 18, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
