import { z } from "zod";
import {
  ReviewsSchema,
  RunSummariesSchema,
  parseResponse,
  type ApiReview,
  type ApiRunSummary,
} from "../api-schemas.js";
import { safeHandler, sanitizeText, toolError, type ToolResult } from "../errors.js";
import { FILE_MAX, cleanField, latestPerAgent } from "../format.js";
import { pathSegment, resolveAgent, resolvePull, resolveRepo } from "../resolve.js";
import { shapeReviews } from "./findings-payload.js";
import {
  MAX_FINDINGS_DEFAULT,
  agentParam,
  cappedResult,
  prParam,
  repoParam,
  signalOpts,
  type ToolAnnotationsDef,
  type ToolCallContext,
  type ToolDeps,
} from "./types.js";

export const NAME = "get_findings";

// VERBATIM
export const DESCRIPTION =
  "Read results of an already-finished DevDigest review on a PR. No new run, no cost. Default: latest review per agent. Pass agent or run_id to narrow, detail=full for rationale/suggestions.";

export const inputSchema = z.object({
  repo: repoParam,
  pr: prParam,
  agent: agentParam.optional(),
  run_id: z.string().uuid().optional().describe("Run id from run_agent_on_pr (narrows to that run)"),
  detail: z.enum(["concise", "full"]).optional().describe("full adds id, rationale, suggestion"),
  limit: z.coerce.number().int().min(1).max(50).optional().describe("Max findings, 1-50 (default 20)"),
});
export type GetFindingsArgs = z.infer<typeof inputSchema>;

export const annotations: ToolAnnotationsDef = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Newest run row first (ran_at is ISO or null). */
function newestFirst(runs: readonly ApiRunSummary[]): ApiRunSummary[] {
  return [...runs].sort((a, b) => Date.parse(b.ran_at ?? "") - Date.parse(a.ran_at ?? "") || 0);
}

function describeRun(run: ApiRunSummary, prNumber: number): string {
  const who = run.agent_name ? ` (${sanitizeText(run.agent_name)})` : "";
  switch (run.status) {
    case "running":
      return `Run ${run.run_id}${who} is still running. Call get_findings again in ~1 min.`;
    case "failed": {
      const why = run.error ? `: ${sanitizeText(run.error)}` : "";
      return `Run ${run.run_id}${who} failed${why}. Retry with run_agent_on_pr.`;
    }
    case "cancelled":
      return `Run ${run.run_id}${who} was cancelled. Retry with run_agent_on_pr.`;
    default:
      return `Run ${run.run_id}${who} finished on PR #${prNumber} but its results are not visible yet. Retry get_findings in a few seconds.`;
  }
}

export function makeGetFindingsHandler(deps: ToolDeps) {
  return safeHandler(
    { apiUrl: deps.config.apiUrl, logger: deps.logger },
    async (args: GetFindingsArgs, ctx?: ToolCallContext): Promise<ToolResult> => {
      const opts = signalOpts(ctx);
      const repo = await resolveRepo(deps.api, args.repo, opts);
      const pull = await resolvePull(deps.api, repo, args.pr, {
        ...opts,
        timeoutMs: deps.config.longHttpTimeoutMs,
      });
      const pullPath = `/pulls/${pathSegment(pull.id)}`;

      // Only kind='review' rows carry agent results; no current server code writes 'summary' rows (see INSIGHTS).
      const reviews: ApiReview[] = parseResponse(
        "GET /pulls/:id/reviews",
        ReviewsSchema,
        await deps.api.get(`${pullPath}/reviews`, opts),
      ).filter((r) => r.kind === "review");

      const loadRuns = async (): Promise<ApiRunSummary[]> =>
        newestFirst(
          parseResponse("GET /pulls/:id/runs", RunSummariesSchema, await deps.api.get(`${pullPath}/runs`, opts)),
        );

      let selected: ApiReview[];
      if (args.run_id !== undefined) {
        selected = reviews.filter((r) => r.run_id === args.run_id);
        if (selected.length === 0) {
          const run = (await loadRuns()).find((r) => r.run_id === args.run_id);
          return toolError(
            run
              ? describeRun(run, pull.number)
              : `Run ${args.run_id} not found on ${repo.fullName} PR #${pull.number}. Omit run_id for the latest review per agent.`,
          );
        }
      } else if (args.agent !== undefined) {
        const agent = await resolveAgent(deps.api, args.agent, opts);
        selected = latestPerAgent(reviews.filter((r) => r.agent_id === agent.id));
        if (selected.length === 0) {
          const run = (await loadRuns()).find((r) => r.agent_id === agent.id);
          return toolError(
            run
              ? describeRun(run, pull.number)
              : `No review by agent '${sanitizeText(agent.name)}' on ${repo.fullName} PR #${pull.number}. Call run_agent_on_pr to create one (spends LLM credits).`,
          );
        }
      } else {
        selected = latestPerAgent(reviews);
        if (selected.length === 0) {
          const running = (await loadRuns()).find((r) => r.status === "running");
          return toolError(
            running
              ? describeRun(running, pull.number)
              : `No finished review on ${repo.fullName} PR #${pull.number}. Call run_agent_on_pr to create one (spends LLM credits).`,
          );
        }
      }

      const shaped = shapeReviews(selected, {
        detail: args.detail ?? "concise",
        limit: args.limit ?? MAX_FINDINGS_DEFAULT,
        withAgent: selected.length > 1,
      });
      return cappedResult({ repo: cleanField(repo.fullName, FILE_MAX), pr: pull.number, ...shaped }, "findings");
    },
  );
}
