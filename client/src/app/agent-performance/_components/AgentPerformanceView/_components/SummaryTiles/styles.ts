import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 } as CSSProperties,
  tile: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minHeight: 132,
  } as CSSProperties,
  labelRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } as CSSProperties,
  label: { fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" } as CSSProperties,
  value: { fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 } as CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-muted)" } as CSSProperties,
  spark: { marginTop: "auto", paddingTop: 6 } as CSSProperties,
  active: { display: "flex", alignItems: "flex-start", gap: 12, marginTop: 6 } as CSSProperties,
  agentIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    background: "var(--bg-hover)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as CSSProperties,
  activeText: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 } as CSSProperties,
  activeName: { fontSize: 16, fontWeight: 700 } as CSSProperties,
};
