import { McpServer } from "@modelcontextprotocol/server";
import { registerTools, type ToolDeps } from "./tools/index.js";

export const SERVER_NAME = "devdigest";
export const SERVER_VERSION = "0.1.0";

// VERBATIM
export const INSTRUCTIONS =
  "DevDigest: local AI PR reviews. Identify repos as owner/name and PRs by number. Flow: list_agents to get an agent → run_agent_on_pr (slow, minutes; spends LLM credits; the only tool that writes) → get_findings to re-read results for free. Prefer get_findings when a review already exists. get_blast_radius is not implemented yet.";

/**
 * Build the MCP server with all tools registered. Transport-agnostic: index.ts
 * connects stdio, tests connect an InMemoryTransport.
 */
export function createServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server, deps);
  return server;
}
