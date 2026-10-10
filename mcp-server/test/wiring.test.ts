import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { makeDeps } from "./helpers/fakes.js";
import { createServer } from "../src/server.js";
import type { ApiClient } from "../src/ports.js";

/** Minimal wiring check; the full server-contract suite is separate. */
describe("createServer wiring", () => {
  it("lists the five tools in fixed order and serves list_agents over InMemoryTransport", async () => {
    const api: ApiClient = {
      get: async (path) =>
        path === "/agents"
          ? [{ id: "a1", name: "Sec", provider: "anthropic", model: "m", enabled: true, system_prompt: "secret" }]
          : [],
      post: async () => ({}),
    };
    const server = createServer(makeDeps(api));
    const client = new Client({ name: "test", version: "0.0.0" });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    await client.connect(clientT);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "list_agents",
      "run_agent_on_pr",
      "get_findings",
      "get_conventions",
      "get_blast_radius",
    ]);

    const res = await client.callTool({ name: "list_agents", arguments: {} });
    const text = (res.content as { text: string }[])[0]!.text;
    expect(JSON.parse(text).agents).toEqual([
      { id: "a1", name: "Sec", description: "", model: "m", enabled: true },
    ]);

    await client.close();
    await server.close();
  });
});
