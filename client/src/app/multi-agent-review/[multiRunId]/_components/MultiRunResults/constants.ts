/** Constants for MultiRunResults. */

export const VIEWS = ["columns", "tabs"] as const;
export type ResultsView = (typeof VIEWS)[number];

/** Query param that opens the trace drawer for one child run. */
export const TRACE_PARAM = "trace";

/** Configure run screen, and the param that preselects a PR there. */
export const CONFIGURE_HREF = "/multi-agent-review";
export const CONFIGURE_PR_PARAM = "pr";
