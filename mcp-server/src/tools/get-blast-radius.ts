import { z } from "zod";
import { toolError, type ToolResult } from "../errors.js";
import { prParam, repoParam, type ToolAnnotationsDef } from "./types.js";

export const NAME = "get_blast_radius";

// VERBATIM
export const DESCRIPTION =
  "NOT IMPLEMENTED YET: placeholder for the PR impact map (planned). Returns a not-implemented notice; use get_findings meanwhile.";

export const NOT_IMPLEMENTED_MESSAGE =
  "get_blast_radius is not implemented yet in devdigest-mcp. Use get_findings(repo, pr) for review results.";

// Same flat shape as the future real tool, so it can be swapped in without a contract change.
export const inputSchema = z.object({
  repo: repoParam,
  pr: prParam,
});
export type GetBlastRadiusArgs = z.infer<typeof inputSchema>;

export const annotations: ToolAnnotationsDef = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Stub: takes no dependencies, so it cannot make a backend call. Intentionally not safeHandler-wrapped (cannot throw). */
export function makeGetBlastRadiusHandler() {
  return async (_args?: GetBlastRadiusArgs): Promise<ToolResult> => toolError(NOT_IMPLEMENTED_MESSAGE);
}
