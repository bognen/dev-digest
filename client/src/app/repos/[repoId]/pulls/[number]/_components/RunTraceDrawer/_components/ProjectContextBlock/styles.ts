import type { CSSProperties } from "react";

export const s = {
  list: { borderTop: "1px solid var(--border)", padding: "8px 12px" } satisfies CSSProperties,
  subhead: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    margin: "4px 0 6px",
  } satisfies CSSProperties,
  docRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 } satisfies CSSProperties,
  path: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  skippedList: { marginTop: 10 } satisfies CSSProperties,
  linkBtn: {
    border: "none",
    background: "transparent",
    color: "var(--accent)",
    cursor: "pointer",
    fontSize: 12,
    padding: 0,
  } satisfies CSSProperties,
  modalPre: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
};
