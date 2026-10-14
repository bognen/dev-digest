import type React from "react";

export const s = {
  card: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
  } as React.CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } as React.CSSProperties,
  title: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } as React.CSSProperties,
  legend: { display: "flex", gap: 14, fontSize: 12.5, color: "var(--text-secondary)" } as React.CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } as React.CSSProperties,
  swatch: (color: string): React.CSSProperties => ({ width: 12, height: 2, background: color, borderRadius: 1 }),
  empty: { padding: "28px 0", textAlign: "center", fontSize: 13, color: "var(--text-muted)" } as React.CSSProperties,
  tipHead: { fontWeight: 600, marginBottom: 2 } as React.CSSProperties,
};
