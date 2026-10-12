/** Pure helpers for the Onboarding Tour page. No hooks, no fetch. */

import type { OnboardingTourProvenance } from "@devdigest/shared";
import type { SectionKey } from "./constants";

const SHORT_SHA_LENGTH = 7;

export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

/** Stale (AC-32): the repo's current indexed commit is known and differs from the tour's. */
export function isStale(currentSha: string | null | undefined, indexedSha: string | null | undefined): boolean {
  return !!currentSha && !!indexedSha && currentSha !== indexedSha;
}

export function sectionId(key: SectionKey): string {
  return `tour-section-${key}`;
}

/**
 * GitHub blob URL at a stored commit (AC-29): `.../blob/<sha>/<path>`.
 * Returns null when the repo, commit or path is missing so callers render plain text.
 */
export function githubBlobUrl(
  fullName: string | undefined,
  sha: string | undefined,
  path: string,
): string | null {
  if (!fullName || !sha || !path) return null;
  const segments = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${fullName}/blob/${encodeURIComponent(sha)}/${segments}`;
}

/**
 * Link policy for LLM Markdown (AC-35). Only hrefs that are exact index paths from the
 * server-provided allowlist become GitHub links at the stored commit; everything else
 * (javascript:, external URLs, unknown paths) returns null = plain text.
 */
export function tourHref(
  linkPaths: readonly string[],
  fullName: string | undefined,
  sha: string | undefined,
): (href: string) => string | null {
  const allowed = new Set(linkPaths);
  return (href) => {
    const path = href.trim().replace(/^\.?\//, "");
    return allowed.has(path) ? githubBlobUrl(fullName, sha, path) : null;
  };
}

export type StatusKind = "generated" | "skeleton";

/** i18n key suffix under `status.*` for the badge text (AC-26): "generated" or the skeleton reason. */
export function statusKey(provenance: OnboardingTourProvenance): string {
  if (provenance.status === "generated") return "generated";
  return provenance.skeleton_reason ?? "skeleton";
}
