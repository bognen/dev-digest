import type React from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 } as React.CSSProperties,
  dashHead: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexWrap: "wrap" } as React.CSSProperties,
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } as React.CSSProperties,
  link: { fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" } as React.CSSProperties,
  casesHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" } as React.CSSProperties,
  h3: { margin: 0, fontSize: 18, fontWeight: 700 } as React.CSSProperties,
  passing: {
    fontSize: 12.5,
    fontWeight: 600,
    padding: "3px 9px",
    borderRadius: 5,
    background: "var(--ok-bg)",
    color: "var(--ok)",
  } as React.CSSProperties,
  spacer: { flex: 1 } as React.CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)" } as React.CSSProperties,
  runningNote: {
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
  } as React.CSSProperties,
};
