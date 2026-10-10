import type { BlastIndexStatus } from "@/lib/hooks/blast-radius";

/** Message keys (under the `blast` namespace) for the non-blocking index banner. */
export type BlastBannerKey =
  | "banner.partial"
  | "banner.degraded"
  | "banner.failed"
  | "banner.reasonOnly"
  | "banner.unsupportedLanguage";

/**
 * Non-blocking banner message key per index status — distinct wording per state,
 * shown ABOVE the (still real, just incomplete) results rather than masking them
 * behind a blocking screen. `full` has no status copy of its own; it only gets
 * a banner when a `degradedReason` is present (see `blastBanner`).
 */
export const STATUS_BANNER: Partial<Record<BlastIndexStatus, BlastBannerKey>> = {
  partial: "banner.partial",
  degraded: "banner.degraded",
  failed: "banner.failed",
};

/** Fallback key for a reason reported on a `full` index. */
export const REASON_ONLY_BANNER: BlastBannerKey = "banner.reasonOnly";

/**
 * Key for a `partial` index that reports `no_data`: the indexer parsed ZERO files,
 * so the repo's language isn't covered by the code index (it only parses
 * TypeScript/JavaScript) and the results come from the best-effort file scan.
 */
export const UNSUPPORTED_LANGUAGE_BANNER: BlastBannerKey = "banner.unsupportedLanguage";

/**
 * Banner shown above the list, as a message key (the component renders it via
 * `t`). The unsupported-language case gets its own plain wording and no internal
 * reason code; every other state keeps its status copy plus the reason.
 */
export function blastBanner(
  status: BlastIndexStatus,
  degradedReason?: string,
): { key: BlastBannerKey; reason?: string } | null {
  if (status === "partial" && degradedReason === "no_data") return { key: UNSUPPORTED_LANGUAGE_BANNER };
  const key = STATUS_BANNER[status] ?? (degradedReason ? REASON_ONLY_BANNER : undefined);
  if (!key) return null;
  return degradedReason ? { key, reason: degradedReason } : { key };
}

/** Card views, in toggle order. `tree` is the default. */
export const BLAST_VIEWS = ["tree", "graph"] as const;
export type BlastView = (typeof BLAST_VIEWS)[number];
export const DEFAULT_BLAST_VIEW: BlastView = "tree";
