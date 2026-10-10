import { z } from "zod";
import { ConventionsSchema, parseResponse } from "../api-schemas.js";
import { safeHandler, textResult, type ToolResult } from "../errors.js";
import { FILE_MAX, cleanField, sortConventions, toConciseConvention } from "../format.js";
import { pathSegment, resolveRepo } from "../resolve.js";
import {
  cappedResult,
  repoParam,
  signalOpts,
  type ToolAnnotationsDef,
  type ToolCallContext,
  type ToolDeps,
} from "./types.js";

export const NAME = "get_conventions";

// VERBATIM
export const DESCRIPTION =
  "Accepted house conventions for a repo (the repo-conventions from the DevDigest Conventions scan, L02). Read-only. Use them when writing or reviewing code in that repo.";

export const DEFAULT_LIMIT = 40;

export const inputSchema = z.object({
  repo: repoParam,
  category: z.string().min(1).optional().describe("Only conventions in this category"),
  limit: z.coerce.number().int().min(1).max(100).optional().describe("Max conventions, 1-100 (default 40)"),
});
export type GetConventionsArgs = z.infer<typeof inputSchema>;

export const annotations: ToolAnnotationsDef = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Reads accepted conventions only. Never calls POST .../extract (costs money). */
export function makeGetConventionsHandler(deps: ToolDeps) {
  return safeHandler(
    { apiUrl: deps.config.apiUrl, logger: deps.logger },
    async (args: GetConventionsArgs, ctx?: ToolCallContext): Promise<ToolResult> => {
      const opts = signalOpts(ctx);
      const repo = await resolveRepo(deps.api, args.repo, opts);
      const rows = parseResponse(
        "GET /repos/:id/conventions",
        ConventionsSchema,
        await deps.api.get(`/repos/${pathSegment(repo.id)}/conventions`, opts),
      );

      const pending = rows.filter((c) => c.status === "pending").length;
      const wantedCategory = args.category?.trim().toLowerCase();
      const accepted = rows.filter(
        (c) =>
          c.status === "accepted" && (wantedCategory === undefined || c.category.toLowerCase() === wantedCategory),
      );

      if (accepted.length === 0) {
        return textResult({
          repo: repo.fullName,
          count: 0,
          conventions: [],
          truncated: 0,
          pending,
          hint:
            pending > 0
              ? `No accepted conventions yet (${pending} pending review). Accept them in the DevDigest UI Conventions tab.`
              : "No accepted conventions for this repo. Run the Conventions scan in the DevDigest UI.",
        });
      }

      const limit = args.limit ?? DEFAULT_LIMIT;
      const page = sortConventions(accepted).slice(0, limit);
      return cappedResult(
        {
          repo: cleanField(repo.fullName, FILE_MAX),
          count: page.length,
          conventions: page.map(toConciseConvention),
          truncated: accepted.length - page.length,
          pending,
        },
        "conventions",
      );
    },
  );
}
