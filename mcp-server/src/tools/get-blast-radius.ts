import { z } from "zod";
import { BlastResponseSchema, parseResponse } from "../api-schemas.js";
import { safeHandler, type ToolResult } from "../errors.js";
import { FILE_MAX, cleanField } from "../format.js";
import { pathSegment, resolvePull, resolveRepo } from "../resolve.js";
import { shapeBlast } from "./blast-payload.js";
import {
  cappedResult,
  prParam,
  repoParam,
  signalOpts,
  type ToolAnnotationsDef,
  type ToolCallContext,
  type ToolDeps,
} from "./types.js";

export const NAME = "get_blast_radius";

// VERBATIM
export const DESCRIPTION =
  "Impact map for a PR from the DevDigest code index: changed symbols, their callers (file:line), and the HTTP endpoints/crons that depend on them. Read-only, no LLM, no cost. Returns status/degraded_reason when the index is incomplete.";

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

/** Read-only: GET /pulls/:id/blast only. Never triggers a resync or any write. */
export function makeGetBlastRadiusHandler(deps: ToolDeps) {
  return safeHandler(
    { apiUrl: deps.config.apiUrl, logger: deps.logger },
    async (args: GetBlastRadiusArgs, ctx?: ToolCallContext): Promise<ToolResult> => {
      const opts = signalOpts(ctx);
      const repo = await resolveRepo(deps.api, args.repo, opts);
      const pull = await resolvePull(deps.api, repo, args.pr, {
        ...opts,
        timeoutMs: deps.config.longHttpTimeoutMs,
      });
      const blast = parseResponse(
        "GET /pulls/:id/blast",
        BlastResponseSchema,
        await deps.api.get(`/pulls/${pathSegment(pull.id)}/blast`, opts),
      );
      return cappedResult(
        { repo: cleanField(repo.fullName, FILE_MAX), pr: pull.number, ...shapeBlast(blast) },
        "downstream",
      );
    },
  );
}
