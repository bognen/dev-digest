import type { CSSProperties } from "react";

/** Severity pill pinned to the right edge of a diff row. */
export function pillFor(color: string, background: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    alignSelf: "center",
    flexShrink: 0,
    padding: "0 7px",
    borderRadius: 5,
    fontSize: 11,
    lineHeight: "18px",
    fontWeight: 600,
    color,
    background,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };
}
