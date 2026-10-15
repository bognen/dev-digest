/* Pure helpers for the CI runs table: link safety, filtering, formatting. */
import type { CiRun, CiRunStatus } from "@devdigest/shared";
import { SEVEN_DAYS_MS, SEVERITY_ORDER } from "./constants";

export type CiRunPeriod = "7d" | "all";

export interface CiRunFilters {
  period: CiRunPeriod;
  agentId: string | null;
  repo: string | null;
  status: CiRunStatus | null;
}

const RUN_URL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/actions\/runs\/(\d+)$/;

/** Returns the run link only when it is a GitHub Actions run URL of `repoFullName`, else null (AC-51). */
export function safeRunUrl(url: string | null | undefined, repoFullName: string): string | null {
  if (!url) return null;
  const m = RUN_URL.exec(url);
  if (!m) return null;
  return `${m[1]}/${m[2]}`.toLowerCase() === repoFullName.toLowerCase() ? url : null;
}

export function sortRunsNewestFirst(runs: CiRun[]): CiRun[] {
  return [...runs].sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at));
}

export function filterRuns(runs: CiRun[], f: CiRunFilters, now: number = Date.now()): CiRun[] {
  return runs.filter((r) => {
    if (f.period === "7d" && now - Date.parse(r.ran_at) > SEVEN_DAYS_MS) return false;
    if (f.agentId && r.agent_id !== f.agentId) return false;
    if (f.repo && r.repo !== f.repo) return false;
    if (f.status && r.status !== f.status) return false;
    return true;
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `2026-06-01 08:42` in local time (design format); the raw value if unparsable. */
export function formatRunTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `7.4s`, or "—" when there is no duration. */
export function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

/** `$0.07`, or "—" when there is no cost. */
export function formatRunCost(usd: number | null): string {
  return usd ? `$${usd.toFixed(2)}` : "—";
}

/** Non-zero severity counts in CRITICAL, WARNING, SUGGESTION order. */
export function findingItems(r: CiRun) {
  return SEVERITY_ORDER.flatMap(({ sev, field }) => {
    const n = r[field] ?? 0;
    return n > 0 ? [{ sev, n }] : [];
  });
}
