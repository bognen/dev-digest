import type { CiFailOn } from "@devdigest/shared";

/** "Fail CI on" segments in design order; labels come from `ci.ciTab.failOn.<labelKey>`. */
export const FAIL_ON_OPTIONS: readonly { value: CiFailOn; labelKey: "critical" | "warning" | "never" }[] = [
  { value: "critical", labelKey: "critical" },
  { value: "warning", labelKey: "warning" },
  { value: "never", labelKey: "never" },
];
