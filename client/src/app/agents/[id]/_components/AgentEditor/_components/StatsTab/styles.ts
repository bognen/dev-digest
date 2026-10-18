import type { CSSProperties } from "react";

/** Co-located styles for the agent StatsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 18, maxWidth: 1040 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" } satisfies CSSProperties,
  h2: { margin: 0, fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  link: { color: "var(--accent-text)" } satisfies CSSProperties,
  picker: { marginLeft: "auto" } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 } satisfies CSSProperties,
  tile: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  tileHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  tileLabel: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" } satisfies CSSProperties,
  tileValue: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  meta: { margin: 0, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  warn: { fontSize: 12, color: "var(--warn)" } satisfies CSSProperties,
  panels: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 } satisfies CSSProperties,
  kv: { display: "grid", gridTemplateColumns: "1fr auto", rowGap: 6, columnGap: 16, fontSize: 13, marginTop: 8 } satisfies CSSProperties,
} as const;
