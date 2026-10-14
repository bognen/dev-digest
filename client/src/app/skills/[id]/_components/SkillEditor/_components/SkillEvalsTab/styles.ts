import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  host: { display: "flex", flexDirection: "column", gap: 6, maxWidth: 520 } satisfies CSSProperties,
  hostLabel: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
