/* multi-run.ts — small shared helpers for the multi-agent review surfaces
   (results shell, Columns, Tabs, Disagreements). Pure, no React. */
import type { ChildRunStatus, MultiRunStatus } from "@devdigest/shared";

/** A child that is still going: its cancel action and live log apply. */
export function isActiveStatus(status: ChildRunStatus): boolean {
  return status === "queued" || status === "running";
}

/** Color token of a child run's status label. */
export function statusColor(status: ChildRunStatus): string {
  switch (status) {
    case "running":
      return "var(--warn)";
    case "failed":
      return "var(--crit)";
    case "done":
      return "var(--ok)";
    default:
      return "var(--text-muted)";
  }
}

/** Color token of a multi-run's aggregate status (previous-runs list). */
export function multiRunStatusColor(status: MultiRunStatus): string {
  switch (status) {
    case "running":
    case "partial":
      return "var(--warn)";
    case "failed":
      return "var(--crit)";
    case "done":
      return "var(--ok)";
    default:
      return "var(--text-muted)";
  }
}

/** Score color used by the Tabs strip (design: >=70 ok, >=50 warn, else crit). */
export function scoreColor(score: number): string {
  return score >= 70 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--crit)";
}

/** Visually hidden but readable by assistive tech (appended to short link text). */
export const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;
