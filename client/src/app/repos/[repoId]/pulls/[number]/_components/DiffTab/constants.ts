/** Constants for the DiffTab (Smart Diff grouping). */
import type { SmartDiffRole } from "@devdigest/shared";

/** Per-role presentation: swatch colour token + i18n keys (namespace `prReview`). */
export const ROLE_META: Record<
  SmartDiffRole,
  { color: string; labelKey: string; descriptionKey: string }
> = {
  core: { color: "var(--accent)", labelKey: "smartDiff.coreLabel", descriptionKey: "smartDiff.coreDescription" },
  tests: { color: "var(--ok)", labelKey: "smartDiff.testsLabel", descriptionKey: "smartDiff.testsDescription" },
  wiring: { color: "var(--info)", labelKey: "smartDiff.wiringLabel", descriptionKey: "smartDiff.wiringDescription" },
  docs: { color: "var(--sugg)", labelKey: "smartDiff.docsLabel", descriptionKey: "smartDiff.docsDescription" },
  boilerplate: {
    color: "var(--text-muted)",
    labelKey: "smartDiff.boilerplateLabel",
    descriptionKey: "smartDiff.boilerplateDescription",
  },
};

/** Display order of the role groups; all of them render, even when empty. */
export const ROLE_ORDER: readonly SmartDiffRole[] = ["core", "tests", "wiring", "docs", "boilerplate"];

/** Roles that start collapsed, even when they contain findings. */
export const COLLAPSED_BY_DEFAULT: readonly SmartDiffRole[] = ["docs", "boilerplate"];

/** Role a PR file absent from the smart-diff response is appended to. */
export const FALLBACK_ROLE: SmartDiffRole = "core";
