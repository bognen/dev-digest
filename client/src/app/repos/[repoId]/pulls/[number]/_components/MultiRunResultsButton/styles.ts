import type { CSSProperties } from "react";

/** Co-located styles for MultiRunResultsButton: a link that matches the
    design system's secondary `sm` Button, plus the live status dot. */
export const s = {
  link: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "5px 9px",
    fontSize: 12.5,
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: "-0.01em",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    textDecoration: "none",
  } satisfies CSSProperties,
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    background: "var(--warn)",
    animation: "ddpulse 1s infinite",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
