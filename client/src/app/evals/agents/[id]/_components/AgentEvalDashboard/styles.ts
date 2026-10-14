import type React from "react";

export const s = {
  page: { maxWidth: 1240, margin: "0 auto", padding: "28px 28px 48px", display: "flex", flexDirection: "column", gap: 18 } as React.CSSProperties,
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 14,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } as React.CSSProperties,
  h1: { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 12 } as React.CSSProperties,
  model: {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-muted)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "2px 8px",
  } as React.CSSProperties,
  subtitle: { margin: "6px 0 0", fontSize: 14, color: "var(--text-secondary)" } as React.CSSProperties,
};
