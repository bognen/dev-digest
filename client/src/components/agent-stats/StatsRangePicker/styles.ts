import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 } as CSSProperties,
  chips: { display: "flex", gap: 6 } as CSSProperties,
  custom: { display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" } as CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 3 } as CSSProperties,
  fieldLabel: { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" } as CSSProperties,
  input: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 13,
    colorScheme: "inherit",
  } as CSSProperties,
  hint: { fontSize: 11.5, color: "var(--text-muted)", paddingBottom: 6 } as CSSProperties,
  invalid: { margin: 0, fontSize: 12, color: "var(--crit)" } as CSSProperties,
};
