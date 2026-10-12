import type { ProjectDocRoot } from "@devdigest/shared";

/** Display order of the discovery roots (matches the server's PROJECT_DOC_ROOTS). */
export const ROOT_ORDER: readonly ProjectDocRoot[] = ["specs", "docs", "insights"];

export const SKELETON_ROWS = 6;

/** API error code raised when the repo has no usable synced checkout (AC-8). */
export const CHECKOUT_UNAVAILABLE = "checkout_unavailable";
