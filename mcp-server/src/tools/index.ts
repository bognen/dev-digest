import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import * as getBlastRadius from "./get-blast-radius.js";
import * as getConventions from "./get-conventions.js";
import * as getFindings from "./get-findings.js";
import * as listAgents from "./list-agents.js";
import * as runAgentOnPr from "./run-agent-on-pr.js";
import type { z } from "zod";
import type { ToolResult } from "../errors.js";
import type { ToolAnnotationsDef, ToolCallContext, ToolDeps } from "./types.js";

export type { ToolDeps, ToolCallContext } from "./types.js";

/** Adapt the SDK handler context into the SDK-independent ToolCallContext. */
function toCallContext(ctx: ServerContext): ToolCallContext {
  const token = ctx.mcpReq._meta?.progressToken;
  return {
    signal: ctx.mcpReq.signal,
    // Progress notifications only when the client asked for them.
    ...(token !== undefined
      ? {
          progress: async ({ progress, total, message }) => {
            await ctx.mcpReq.notify({
              method: "notifications/progress",
              params: {
                progressToken: token,
                progress,
                ...(total !== undefined ? { total } : {}),
                ...(message !== undefined ? { message } : {}),
              },
            });
          },
        }
      : {}),
  };
}

interface ToolModule<A> {
  NAME: string;
  DESCRIPTION: string;
  inputSchema: z.ZodType<A>;
  annotations: ToolAnnotationsDef;
}

type Registrar = (server: McpServer, deps: ToolDeps) => void;

function registrar<A>(
  mod: ToolModule<A>,
  makeHandler: (deps: ToolDeps) => (args: A, ctx: ToolCallContext) => Promise<ToolResult>,
): Registrar {
  return (server, deps) => {
    const handler = makeHandler(deps);
    server.registerTool(
      mod.NAME,
      { description: mod.DESCRIPTION, inputSchema: mod.inputSchema, annotations: mod.annotations },
      (args, ctx) => handler(args as A, toCallContext(ctx)),
    );
  };
}

/** The single source of tool order: order here = order in tools/list. */
const TOOLS: Registrar[] = [
  registrar(listAgents, listAgents.makeListAgentsHandler),
  registrar(runAgentOnPr, runAgentOnPr.makeRunAgentOnPrHandler),
  registrar(getFindings, getFindings.makeGetFindingsHandler),
  registrar(getConventions, getConventions.makeGetConventionsHandler),
  registrar(getBlastRadius, getBlastRadius.makeGetBlastRadiusHandler),
];

/** The single registration point for all tools. */
export function registerTools(server: McpServer, deps: ToolDeps): void {
  for (const register of TOOLS) register(server, deps);
}
