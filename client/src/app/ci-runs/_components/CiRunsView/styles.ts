import type { CSSProperties } from "react";

export const s = {
  header: { padding: "20px 28px 6px", display: "flex", alignItems: "flex-end", gap: 12 } as CSSProperties,
  h1: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } as CSSProperties,
  subtitle: { margin: "3px 0 0", fontSize: 13, color: "var(--text-secondary)" } as CSSProperties,
  actions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } as CSSProperties,
  autoRefresh: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  } as CSSProperties,
  dot: { width: 6, height: 6, borderRadius: 99, background: "var(--ok)" } as CSSProperties,
  filters: { display: "flex", gap: 8, padding: "12px 28px", flexWrap: "wrap" } as CSSProperties,
  state: { margin: "6px 28px 40px" } as CSSProperties,
  noMatch: { padding: "40px 28px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" } as CSSProperties,
  hint: { display: "block", marginTop: 8, fontSize: 12.5, color: "var(--text-muted)" } as CSSProperties,
};
