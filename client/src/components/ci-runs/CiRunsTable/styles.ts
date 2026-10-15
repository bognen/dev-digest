import type { CSSProperties } from "react";
import { CI_RUNS_GRID } from "./constants";

const row: CSSProperties = {
  display: "grid",
  gridTemplateColumns: CI_RUNS_GRID,
  gap: 12,
  alignItems: "center",
};

export const s = {
  table: {
    margin: "6px 28px 40px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } as CSSProperties,
  head: {
    ...row,
    padding: "10px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } as CSSProperties,
  row: { ...row, padding: "12px 16px", fontSize: 12.5 } as CSSProperties,
  rowBorder: { borderBottom: "1px solid var(--border)" } as CSSProperties,
  ts: { fontSize: 11, color: "var(--text-secondary)" } as CSSProperties,
  prCell: { minWidth: 0 } as CSSProperties,
  prNum: { fontSize: 11, color: "var(--accent-text)" } as CSSProperties,
  prTitle: {
    fontSize: 12.5,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "inline-block",
    verticalAlign: "bottom",
    maxWidth: "85%",
  } as CSSProperties,
  agent: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
    minWidth: 0,
  } as CSSProperties,
  agentIcon: { color: "var(--text-muted)", flexShrink: 0 } as CSSProperties,
  agentName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as CSSProperties,
  removed: { fontSize: 10.5, color: "var(--text-muted)", flexShrink: 0 } as CSSProperties,
  dur: { fontSize: 12 } as CSSProperties,
  none: { fontSize: 12, color: "var(--text-muted)" } as CSSProperties,
  findings: { display: "flex", gap: 7 } as CSSProperties,
  cost: { fontSize: 12, color: "var(--text-secondary)" } as CSSProperties,
  statusCell: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, minWidth: 0 } as CSSProperties,
  partial: { fontSize: 11 } as CSSProperties,
  linkCell: { position: "relative" } as CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } as CSSProperties,
};

export function findingStyle(color: string): CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 600, color };
}
