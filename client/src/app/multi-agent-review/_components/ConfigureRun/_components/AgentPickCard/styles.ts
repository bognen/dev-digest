import type { CSSProperties } from "react";

/** Co-located styles for AgentPickCard (design: PersonaPickCard). The design's
    `hex + "12"` / `"1f"` alpha suffixes do not work with var() tokens, so the
    tints use color-mix (0x12 ≈ 7%, 0x1f ≈ 12%). */
export const s = {
  card: (on: boolean, color: string): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 9,
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    color: "var(--text-primary)",
    border: `1px solid ${on ? color : "var(--border)"}`,
    background: on ? `color-mix(in srgb, ${color} 7%, transparent)` : "var(--bg-elevated)",
    transition: "border-color .12s, background .12s",
  }),
  box: (on: boolean, color: string): CSSProperties => ({
    width: 18,
    height: 18,
    borderRadius: 5,
    flexShrink: 0,
    marginTop: 1,
    display: "grid",
    placeItems: "center",
    border: `1.5px solid ${on ? color : "var(--border-strong)"}`,
    background: on ? color : "transparent",
  }),
  check: { color: "#fff" } satisfies CSSProperties,
  tile: (color: string): CSSProperties => ({
    width: 30,
    height: 30,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    color,
    flexShrink: 0,
  }),
  text: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600 } satisfies CSSProperties,
  description: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginTop: 3,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  estimate: {
    fontSize: 10.5,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
