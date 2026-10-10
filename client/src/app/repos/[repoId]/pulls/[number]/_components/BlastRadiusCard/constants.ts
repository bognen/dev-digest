import type { BlastIndexStatus } from "@/lib/hooks/blast-radius";

/**
 * Non-blocking banner copy per index status — distinct wording per state, shown
 * ABOVE the (still real, just incomplete) results rather than masking them
 * behind a blocking screen. `full`/`failed` render no banner here — `failed`
 * has no separate copy in v1 (specs/07-blast-radius.md only calls out
 * `partial`/`degraded`).
 */
export const STATUS_BANNER: Partial<Record<BlastIndexStatus, string>> = {
  partial:
    "This repo's index is only partially built — some callers or impacted endpoints may be missing.",
  degraded:
    "This repo's index isn't available yet — showing a best-effort, less precise blast radius.",
};

/**
 * Banner shown above the list. A `partial` index that reports `no_data` means the
 * indexer parsed ZERO files — the repo's language isn't covered by the code index
 * (it only parses TypeScript/JavaScript) — so the results come from the
 * best-effort file scan. That gets its own plain wording and no internal reason
 * code; every other state keeps its status copy plus the reason.
 */
export const UNSUPPORTED_LANGUAGE_BANNER =
  "Best-effort scan — this repo's language isn't covered by the code index, so some callers or endpoints may be missing.";

export function blastBanner(
  status: BlastIndexStatus,
  degradedReason?: string,
): { text: string; reason?: string } | null {
  if (status === "partial" && degradedReason === "no_data") return { text: UNSUPPORTED_LANGUAGE_BANNER };
  const text = STATUS_BANNER[status];
  if (!text) return null;
  return degradedReason ? { text, reason: degradedReason } : { text };
}
