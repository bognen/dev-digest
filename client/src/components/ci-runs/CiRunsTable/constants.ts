import type { CiRunStatus } from "@devdigest/shared";

/** Design grid: Timestamp · Pull request · Agent · Source · Dur. · Findings · Cost · Status · link. */
export const CI_RUNS_GRID = "140px 1fr 150px 130px 70px 110px 70px 110px 80px";

/** Column header i18n keys (`ci.runs.table.*`); the last column has no header. */
export const CI_RUNS_COLUMNS = [
  "timestamp",
  "pullRequest",
  "agent",
  "source",
  "duration",
  "findings",
  "cost",
  "status",
  null,
] as const;

/** Status badge colors + the `ci.runs.status.*` label key. */
export const CI_STATUS_STYLE: Record<CiRunStatus, { c: string; bg: string; label: string }> = {
  succeeded: { c: "var(--ok)", bg: "var(--ok-bg)", label: "succeeded" },
  no_findings: { c: "var(--text-secondary)", bg: "var(--bg-hover)", label: "noFindings" },
  failed: { c: "var(--crit)", bg: "var(--crit-bg)", label: "failed" },
  skipped: { c: "var(--warn)", bg: "var(--warn-bg)", label: "skipped" },
  rejected: { c: "var(--crit)", bg: "var(--crit-bg)", label: "rejected" },
  result_expired: { c: "var(--text-secondary)", bg: "var(--bg-hover)", label: "resultExpired" },
};

/** Reject reason codes that have a `ci.runs.reason.*` string. */
export const REJECT_REASONS = [
  "too_large",
  "schema",
  "repository_mismatch",
  "sha_mismatch",
  "agent_inactive",
  "workflow_modified",
] as const;

export const SEVERITY_ORDER = [
  { sev: "CRITICAL", field: "critical" },
  { sev: "WARNING", field: "warning" },
  { sev: "SUGGESTION", field: "suggestion" },
] as const;

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
