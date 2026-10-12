import type { CSSProperties } from "react";

export const s = {
  page: { padding: "28px 32px", maxWidth: 1280, margin: "0 auto" } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 } satisfies CSSProperties,
  heading: { fontSize: 26, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.5 } satisfies CSSProperties,
  refreshError: {
    padding: "10px 14px",
    marginBottom: 16,
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 380px) 1fr",
    gap: 16,
    alignItems: "start",
  } satisfies CSSProperties,
  previewPane: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    minHeight: 240,
    overflow: "hidden",
  } satisfies CSSProperties,
  placeholder: {
    padding: "48px 24px",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 13,
  } satisfies CSSProperties,
  skeletonRow: { marginBottom: 8 } satisfies CSSProperties,
} as const;
