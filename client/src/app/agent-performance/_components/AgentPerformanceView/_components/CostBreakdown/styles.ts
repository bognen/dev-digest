import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 } as CSSProperties,
  h3: { margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" } as CSSProperties,
  reconcile: { margin: "10px 0 0", fontSize: 12, color: "var(--text-muted)" } as CSSProperties,
  empty: { margin: 0, fontSize: 13, color: "var(--text-muted)" } as CSSProperties,
};
