import { z } from "zod";
import { AgentsSchema, parseResponse } from "../api-schemas.js";
import { safeHandler, textResult, type ToolResult } from "../errors.js";
import { toConciseAgent } from "../format.js";
import { cappedResult, type ToolAnnotationsDef, type ToolCallContext, type ToolDeps, signalOpts } from "./types.js";

export const NAME = "list_agents";

// VERBATIM
export const DESCRIPTION =
  "List configured DevDigest reviewer agents (id, name, description, model, enabled). Call this first to get a valid `agent` for run_agent_on_pr / get_findings.";

export const inputSchema = z.object({
  include_disabled: z.boolean().optional().describe("Also list disabled agents (default false)"),
});
export type ListAgentsArgs = z.infer<typeof inputSchema>;

export const annotations: ToolAnnotationsDef = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function makeListAgentsHandler(deps: ToolDeps) {
  return safeHandler(
    { apiUrl: deps.config.apiUrl, logger: deps.logger },
    async (args: ListAgentsArgs, ctx?: ToolCallContext): Promise<ToolResult> => {
      const agents = parseResponse("GET /agents", AgentsSchema, await deps.api.get("/agents", signalOpts(ctx)));
      const shown = args.include_disabled ? agents : agents.filter((a) => a.enabled);
      const hidden = agents.length - shown.length;

      if (shown.length === 0) {
        return textResult({
          agents: [],
          count: 0,
          hidden_disabled: hidden,
          hint:
            hidden > 0
              ? "No enabled agents. Pass include_disabled=true to see disabled ones, or enable an agent in the DevDigest UI."
              : "No agents configured. Create a reviewer agent in the DevDigest UI first.",
        });
      }
      return cappedResult(
        { agents: shown.map(toConciseAgent), count: shown.length, hidden_disabled: hidden },
        "agents",
      );
    },
  );
}
