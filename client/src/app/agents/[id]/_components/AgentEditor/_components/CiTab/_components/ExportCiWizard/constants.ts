import type { CiPostAs, CiTrigger } from "@devdigest/shared";

/** Stepper order; labels come from `ci.exportWizard.steps.<key>`. */
export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;
export const STEP_TARGET = 0;
export const STEP_PREVIEW = 1;
export const STEP_CONFIGURE = 2;
export const STEP_INSTALL = 3;

/** Trigger chips in design order. `reopened` is off by default. */
export const TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
export const DEFAULT_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];

export const POST_OPTIONS: readonly {
  value: CiPostAs;
  labelKey: "githubReview" | "prComment" | "none";
  recommended: boolean;
}[] = [
  { value: "github_review", labelKey: "githubReview", recommended: true },
  { value: "pr_comment", labelKey: "prComment", recommended: false },
  { value: "none", labelKey: "none", recommended: false },
];
export const DEFAULT_POST_AS: CiPostAs = "github_review";

/** GitHub Action setup documentation (the agent-runner README). */
export const CI_DOCS_URL = "https://github.com/bognen/dev-digest/blob/main/agent-runner/README.md";

/** Only GitHub URLs are rendered as links. */
export const GITHUB_URL_RE = /^https:\/\/github\.com\//;
