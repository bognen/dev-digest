import type { CSSProperties } from "react";

export const s = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "28px 28px 48px" } as CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 22, flexWrap: "wrap" } as CSSProperties,
  h1: { margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } as CSSProperties,
  subtitle: { margin: "6px 0 0", fontSize: 14, color: "var(--text-secondary)" } as CSSProperties,
  actions: { marginLeft: "auto", display: "flex", alignItems: "flex-start", gap: 10 } as CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 24 } as CSSProperties,
  tilesSkeleton: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 } as CSSProperties,
  rules: { margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 } as CSSProperties,
};
