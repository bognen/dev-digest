import type React from "react";

export const s = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 9,
    fontSize: 13.5,
    color: "var(--text-primary)",
  } as React.CSSProperties,
  icon: { color: "var(--warn)", flexShrink: 0 } as React.CSSProperties,
};
