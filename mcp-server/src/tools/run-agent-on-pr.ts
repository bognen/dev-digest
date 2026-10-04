import { z } from "zod";
import {
  ActiveRunsSchema,
  ReviewRunResponseSchema,
  ReviewsSchema,
  RunSummariesSchema,
  parseResponse,
  type ApiReview,
} from "../api-schemas.js";
import { ApiSchemaError, clampMessage, safeHandler, sanitizeText, textResult, toolError, type ToolResult } from "../errors.js";
import { pathSegment, resolveAgent, resolvePull, resolveRepo } from "../resolve.js";
import { AGENT_NAME_MAX, FILE_MAX, cleanField } from "../format.js";
import { waitForRun } from "../wait.js";
import { shapeReviews } from "./findings-payload.js";
import {
  MAX_FINDINGS_DEFAULT,
  agentParam,
  prParam,
  repoParam,
  signalOpts,
  cappedResult,
  type ToolAnnotationsDef,
  type ToolCallContext,
  type ToolDeps,
} from "./types.js";

export const NAME = "run_agent_on_pr";

// VERBATIM
export const DESCRIPTION =
  "Run one reviewer agent on a PR and WAIT for it to finish (often 1–4 min; spends LLM credits). Returns {verdict, score, findings[]}. Reuses an in-flight run of the same agent. The only tool that writes. Use get_findings to re-read results.";

export const inputSchema = z.object({
  repo: repoParam,
  pr: prParam,
  agent: agentParam,
});
export type RunAgentOnPrArgs = z.infer<typeof inputSchema>;

export const annotations: ToolAnnotationsDef = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/** Retries to find the review row after a run turns `done` (row may lag the status). */
export const REVIEW_VISIBLE_ATTEMPTS = 3;
export const REVIEW_VISIBLE_DELAY_MS = 1_000;

export function makeRunAgentOnPrHandler(deps: ToolDeps) {
  /**
   * Single-flight guard keyed `${pull.id}:${agent.id}`: concurrent calls in THIS
   * process for the same PR+agent share one start (check-active + POST), so they
   * cannot each POST (and bill) a run. Cross-process duplicates (two MCP servers,
   * the UI) still need the server-side atomic guard (see INSIGHTS.md). A joiner
   * shares the first caller's start, including its cancellation signal.
   */
  const inflightStarts = new Map<string, Promise<{ runId: string; reused: boolean }>>();
  const sleep = deps.sleep;
  const now = deps.now;
  const { config } = deps;

  return safeHandler(
    { apiUrl: config.apiUrl, logger: deps.logger },
    async (args: RunAgentOnPrArgs, ctx?: ToolCallContext): Promise<ToolResult> => {
      const opts = signalOpts(ctx);
      const longOpts = { ...opts, timeoutMs: config.longHttpTimeoutMs };

      // Resolve everything BEFORE the POST: the server does not validate agentId and the POST spends credits.
      const repo = await resolveRepo(deps.api, args.repo, opts);
      const pull = await resolvePull(deps.api, repo, args.pr, longOpts);
      const agent = await resolveAgent(deps.api, args.agent, opts);
      const pullPath = `/pulls/${pathSegment(pull.id)}`;

      // Reuse an in-flight run of the same agent instead of paying twice.
      const startRun = async (): Promise<{ runId: string; reused: boolean }> => {
        const active = parseResponse(
          "GET /pulls/:id/runs/active",
          ActiveRunsSchema,
          await deps.api.get(`${pullPath}/runs/active`, opts),
        );
        const found = active.find((r) => r.agent_id === agent.id);
        if (found) return { runId: found.run_id, reused: true };
        // No auto-retry: a retried POST could start (and bill) a second run.
        const started = parseResponse(
          "POST /pulls/:id/review",
          ReviewRunResponseSchema,
          await deps.api.post(`${pullPath}/review`, { agentId: agent.id }, longOpts),
        );
        const run = started.runs.find((r) => r.agent_id === agent.id) ?? started.runs[0];
        if (!run) throw new ApiSchemaError("POST /pulls/:id/review");
        return { runId: run.run_id, reused: false };
      };

      const flightKey = `${pull.id}:${agent.id}`;
      let start = inflightStarts.get(flightKey);
      const joined = start !== undefined;
      if (!start) {
        start = startRun().finally(() => inflightStarts.delete(flightKey));
        inflightStarts.set(flightKey, start);
      }
      const { runId, reused } = await start;
      const existing = reused || joined;

      const progress = ctx?.progress;
      const outcome = await waitForRun(
        {
          fetchRuns: async (signal) =>
            parseResponse(
              "GET /pulls/:id/runs",
              RunSummariesSchema,
              await deps.api.get(`${pullPath}/runs`, signal ? { signal } : {}),
            ),
          sleep,
          now,
          ...(ctx?.signal ? { signal: ctx.signal } : {}),
          ...(progress
            ? {
                onProgress: (p: { elapsedMs: number; status: string }) => {
                  // Fire-and-forget: a failed notification must never fail the run.
                  void Promise.resolve(
                    progress({
                      progress: Math.round(p.elapsedMs / 1000),
                      total: Math.round(config.runWaitMs / 1000),
                      message: `Run ${p.status}`,
                    }),
                  ).catch(() => undefined);
                },
              }
            : {}),
        },
        { runId, deadlineMs: config.runWaitMs, pollIntervalMs: config.pollIntervalMs },
      );

      const waitedS = Math.round(outcome.waitedMs / 1000);
      const agentLabel = cleanField(agent.name, AGENT_NAME_MAX);
      const base = {
        repo: cleanField(repo.fullName, FILE_MAX),
        pr: pull.number,
        agent: agentLabel,
        run_id: runId,
        ...(existing ? { reused_active_run: true } : {}),
        ...(agent.enabled ? {} : { agent_enabled: false }),
      };

      async function findReview(id: string): Promise<ApiReview | undefined> {
        for (let attempt = 0; attempt < REVIEW_VISIBLE_ATTEMPTS; attempt += 1) {
          const reviews = parseResponse(
            "GET /pulls/:id/reviews",
            ReviewsSchema,
            await deps.api.get(`${pullPath}/reviews`, opts),
          );
          const hit = reviews.find((r) => r.run_id === id && r.kind === "review");
          if (hit) return hit;
          if (attempt < REVIEW_VISIBLE_ATTEMPTS - 1) await sleep(REVIEW_VISIBLE_DELAY_MS, ctx?.signal);
        }
        return undefined;
      }

      switch (outcome.state) {
        case "aborted":
          // Caller went away. Stop quietly; the server run is NOT cancelled.
          return textResult({
            ...base,
            status: "aborted",
            waited_s: waitedS,
            hint: `Request cancelled; the run keeps going. Call get_findings with repo, pr and run_id=${runId} later.`,
          });

        case "timeout":
          return textResult({
            status: "running",
            run_id: runId,
            agent: agentLabel,
            waited_s: waitedS,
            hint: outcome.run
              ? `Still running. Call get_findings with repo, pr and run_id=${runId} in ~1 min.`
              : `Still running (run not listed by the API yet). Call get_findings with repo, pr and run_id=${runId} in ~1 min.`,
          });

        case "failed": {
          const why = outcome.run?.error ? `: ${sanitizeText(outcome.run.error)}` : "";
          return toolError(
            clampMessage(`Run ${runId} failed${why}. Check the API terminal logs, then retry run_agent_on_pr.`),
          );
        }

        case "cancelled":
          return toolError(`Run ${runId} was cancelled on the server. Call run_agent_on_pr again to retry.`);

        case "done": {
          const review = await findReview(runId);
          if (!review) {
            return textResult({
              ...base,
              status: "done",
              waited_s: waitedS,
              hint: `Run finished but results are not visible yet. Call get_findings with repo, pr and run_id=${runId}.`,
            });
          }
          const shaped = shapeReviews([review], {
            detail: "concise",
            limit: MAX_FINDINGS_DEFAULT,
            withAgent: false,
          });
          return cappedResult({ ...base, status: "done", waited_s: waitedS, ...shaped }, "findings");
        }
      }
    },
  );
}
