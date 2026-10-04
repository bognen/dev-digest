import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_RESPONSE_CHARS } from "../src/format.js";
import { createServer } from "../src/server.js";
import { REPO, baseRoutes, fakeApi, finding, makeDeps, review, type Route } from "./helpers/fakes.js";

// Literal copies of specs/06-mcp-server-plan.md section 3 (do NOT import from src).
const EXPECTED_ORDER = ["list_agents", "run_agent_on_pr", "get_findings", "get_conventions", "get_blast_radius"];
const EXPECTED_DESCRIPTIONS: Record<string, string> = {
  list_agents:
    "List configured DevDigest reviewer agents (id, name, model). Call this first to get a valid `agent` for run_agent_on_pr / get_findings.",
  run_agent_on_pr:
    "Run one reviewer agent on a PR and WAIT for it to finish (often 1–4 min; spends LLM credits). Returns {verdict, score, findings[]}. Reuses an in-flight run of the same agent. The only tool that writes. Use get_findings to re-read results.",
  get_findings:
    "Read results of an already-finished DevDigest review on a PR. No new run, no cost. Default: latest review per agent. Pass agent or run_id to narrow, detail=full for rationale/suggestions.",
  get_conventions:
    "Accepted house conventions for a repo (the repo-conventions from the DevDigest Conventions scan, L02). Read-only. Use them when writing or reviewing code in that repo.",
  get_blast_radius:
    "NOT IMPLEMENTED YET: placeholder for the PR impact map (planned). Returns a not-implemented notice; use get_findings meanwhile.",
};
const EXPECTED_INSTRUCTIONS =
  "DevDigest: local AI PR reviews. Identify repos as owner/name and PRs by number. Flow: list_agents to get an agent → run_agent_on_pr (slow, minutes; spends LLM credits; the only tool that writes) → get_findings to re-read results for free. Prefer get_findings when a review already exists. get_blast_radius is not implemented yet.";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function connect(routes: Record<string, Route> = {}) {
  const api = fakeApi(routes);
  const server = createServer(makeDeps(api));
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  await client.connect(clientT);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
  return { api, client };
}

const textOf = (res: { content: unknown }) => (res.content as { text: string }[])[0]!.text;

describe("server contract: tools/list", () => {
  it("exposes exactly the five tools in fixed order with VERBATIM plan descriptions", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(EXPECTED_ORDER);
    for (const t of tools) expect(t.description).toBe(EXPECTED_DESCRIPTIONS[t.name]);
  });

  it("server instructions equal the plan text and are <= 450 chars", async () => {
    const { client } = await connect();
    const instructions = client.getInstructions();
    expect(instructions).toBe(EXPECTED_INSTRUCTIONS);
    expect(instructions!.length).toBeLessThanOrEqual(450);
  });

  it("respects token budgets: description <= 300, every param describe <= 80, serialized list <= 6000", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.description!.length).toBeLessThanOrEqual(300);
      const props = (t.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      for (const [name, schema] of Object.entries(props)) {
        expect(schema.description, `${t.name}.${name} has a description`).toBeTruthy();
        expect(schema.description!.length, `${t.name}.${name}`).toBeLessThanOrEqual(80);
      }
    }
    expect(JSON.stringify({ tools }).length).toBeLessThanOrEqual(6000);
  });

  it("annotations: run_agent_on_pr is the only non-read-only tool; no alwaysLoad meta", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const t of tools) {
      if (t.name === "run_agent_on_pr") {
        expect(t.annotations).toMatchObject({
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        });
      } else {
        expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      }
      expect(JSON.stringify(t)).not.toContain("alwaysLoad");
      expect(t._meta?.["anthropic/alwaysLoad"]).toBeUndefined();
    }
  });
});

describe("server contract: calls", () => {
  it("coerces pr:'42' (string) to a number", async () => {
    const { client, api } = await connect({
      ...baseRoutes(),
      "GET /pulls/p1/reviews": [review({ findings: [finding({ title: "ok" })] })],
      "GET /pulls/p1/runs": [],
    });
    const res = await client.callTool({ name: "get_findings", arguments: { repo: "acme/api", pr: "42" } });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(textOf(res))).toMatchObject({ pr: 42 });
    expect(api.calls.length).toBeGreaterThan(0);
  });

  it("invalid input yields an isError result and never calls the API", async () => {
    const { client, api } = await connect(baseRoutes());
    const res = await client.callTool({ name: "get_findings", arguments: { repo: "acme/api", pr: "abc" } });
    expect(res.isError).toBe(true);
    const res2 = await client.callTool({ name: "run_agent_on_pr", arguments: { repo: "acme/api" } });
    expect(res2.isError).toBe(true);
    expect(api.calls).toEqual([]);
  });

  it("a 300-finding review through get_findings stays <= MAX_RESPONSE_CHARS with truncated > 0", async () => {
    expect(MAX_RESPONSE_CHARS).toBe(16000);
    const many = Array.from({ length: 300 }, (_, i) =>
      finding({ id: `f${i}`, title: `T${i}`, rationale: "r".repeat(2000), file: `src/f${i}.ts`, start_line: i + 1, end_line: i + 5 }),
    );
    const { client } = await connect({
      ...baseRoutes(),
      "GET /pulls/p1/reviews": [review({ findings: many })],
      "GET /pulls/p1/runs": [],
    });
    const res = await client.callTool({
      name: "get_findings",
      arguments: { repo: "acme/api", pr: 42, limit: 50, detail: "full" },
    });
    const text = textOf(res);
    expect(text.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    expect(Object.keys(JSON.parse(text))[0]).toBe("untrusted");
    const out = JSON.parse(text);
    expect(out.truncated).toBeGreaterThan(0);
    expect(out.findings.length).toBeLessThan(50);
  });

  it("a very large agent list is also capped", async () => {
    const agents = Array.from({ length: 300 }, (_, i) => ({
      id: `agent-${i}`,
      name: `Agent number ${i}`,
      description: "d".repeat(200),
      provider: "anthropic",
      model: "claude-some-long-model-name",
      enabled: true,
    }));
    const { client } = await connect({ "GET /repos": [REPO], "GET /agents": agents });
    const res = await client.callTool({ name: "list_agents", arguments: {} });
    const text = textOf(res);
    expect(text.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    expect(JSON.parse(text).truncated).toBeGreaterThan(0);
  });
});
