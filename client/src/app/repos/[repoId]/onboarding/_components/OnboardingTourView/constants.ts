import type { IconName } from "@devdigest/ui";

/** Fixed section order (AC-28). Keys match the `OnboardingTour` fields and `section.*` i18n keys. */
export const SECTION_ORDER = [
  "architecture",
  "critical_paths",
  "run_locally",
  "reading_path",
  "first_tasks",
] as const;

export type SectionKey = (typeof SECTION_ORDER)[number];

export const SECTION_ICONS: Record<SectionKey, IconName> = {
  architecture: "Layers",
  critical_paths: "Activity",
  run_locally: "Command",
  reading_path: "ListChecks",
  first_tasks: "Target",
};

/** Scroll-spy band: a section is "active" while it crosses the upper part of the viewport. */
export const SCROLL_SPY_ROOT_MARGIN = "-10% 0px -70% 0px";

export const SKELETON_CARDS = 3;

/** How long the "Copied" confirmation stays visible. */
export const COPIED_RESET_MS = 1500;
