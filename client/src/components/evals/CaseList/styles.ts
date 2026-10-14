import type React from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 } as React.CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 18px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
  } as React.CSSProperties,
  main: { flex: 1, minWidth: 0 } as React.CSSProperties,
  name: { fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" } as React.CSSProperties,
  sub: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 } as React.CSSProperties,
  tag: {
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 9px",
    borderRadius: 5,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  actions: { display: "inline-flex", gap: 4 } as React.CSSProperties,
  ok: { color: "var(--ok)", flexShrink: 0 } as React.CSSProperties,
  bad: { color: "var(--crit)", flexShrink: 0 } as React.CSSProperties,
  warn: { color: "var(--warn)", flexShrink: 0 } as React.CSSProperties,
  muted: { color: "var(--text-muted)", flexShrink: 0 } as React.CSSProperties,
  spin: { color: "var(--accent)", flexShrink: 0, animation: "ddspin 1s linear infinite" } as React.CSSProperties,
};
