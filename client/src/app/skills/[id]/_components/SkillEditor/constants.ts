import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Skill editor tabs. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "tabs.stats", icon: "BarChart" },
  { key: "context", labelKey: "tabs.context", icon: "Folder" },
  { key: "evals", labelKey: "tabs.evals", icon: "FlaskConical" },
  { key: "versions", labelKey: "tabs.versions", icon: "History" },
];
