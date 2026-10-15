/* Pure helpers for the agent CI tab (no React). */
import type { CiInstallation, CiRunStatus, Repo } from "@devdigest/shared";
import { relativeTime } from "@/lib/format";

/** Design copy "4m ago" (the shared `relativeTime` yields "4m" / "now" / "—"). */
export function timeAgo(iso: string | null | undefined): string {
  const r = relativeTime(iso);
  if (r === "—") return r;
  return r === "now" ? "just now" : `${r} ago`;
}

/** Only GitHub URLs are rendered as links (PR links are server-provided). */
export function safeGithubUrl(url: string | null | undefined): string | null {
  return url && /^https:\/\/github\.com\//.test(url) ? url : null;
}

/** Re-export / "Update CI config" is unavailable while a removal is pending (or done). */
export function canUpdate(i: CiInstallation): boolean {
  return i.status === "active";
}

export function canRemove(i: CiInstallation): boolean {
  return i.status === "active";
}

/** The installation the header "Update CI config" re-exports: first one that may be updated. */
export function firstUpdatable(installations: readonly CiInstallation[]): CiInstallation | null {
  return installations.find(canUpdate) ?? null;
}

/** Default repository for "Add to CI": the first connected repo with no live installation. */
export function firstFreeRepoId(repos: readonly Repo[] | undefined, installations: readonly CiInstallation[]): string | undefined {
  if (!repos?.length) return undefined;
  const taken = new Set(installations.filter((i) => i.status !== "removed").map((i) => i.repo_id));
  return (repos.find((r) => !taken.has(r.id)) ?? repos[0])?.id;
}

export function isOutdated(i: CiInstallation, currentVersion: number): boolean {
  return i.status === "active" && i.workflow_version < currentVersion;
}

/** Row status badge: installation lifecycle first, then the latest run's status. */
export type RowStatus =
  | { kind: "lifecycle"; key: "active" | "removalPending" | "removed" }
  | { kind: "run"; status: CiRunStatus };

export function rowStatus(i: CiInstallation): RowStatus {
  if (i.status === "removed") return { kind: "lifecycle", key: "removed" };
  if (i.status === "removal_pending") return { kind: "lifecycle", key: "removalPending" };
  if (i.latest_run) return { kind: "run", status: i.latest_run.status };
  return { kind: "lifecycle", key: "active" };
}
