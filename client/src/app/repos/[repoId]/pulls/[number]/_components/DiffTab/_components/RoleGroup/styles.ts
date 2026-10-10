import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  toggleAll: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    fontSize: 12,
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
    padding: "6px 2px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  text: { display: "flex", alignItems: "baseline", gap: 8, flex: 1, minWidth: 0 } satisfies CSSProperties,
  label: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  description: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  findingsBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--crit)",
  } satisfies CSSProperties,
  findingsDot: { width: 8, height: 8, borderRadius: "50%", background: "var(--crit)" } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
};

export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}

export function swatchFor(color: string): CSSProperties {
  return { width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 };
}
