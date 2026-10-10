import { describe, expect, it } from "vitest";
import { makeListAgentsHandler } from "../../src/tools/list-agents.js";
import { fakeApi, jsonOf, makeDeps, textOf } from "../helpers/fakes.js";

const agent = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  name: "Sec",
  description: "d",
  provider: "anthropic",
  model: "m",
  enabled: true,
  system_prompt: "TOP-SECRET-PROMPT",
  output_schema: { secret: "SCHEMA-LEAK" },
  ...over,
});

const run = (agents: unknown[], args: { include_disabled?: boolean } = {}) =>
  makeListAgentsHandler(makeDeps(fakeApi({ "GET /agents": agents })))(args);

describe("list_agents", () => {
  it("never leaks system_prompt/output_schema; hides disabled by default and counts them", async () => {
    const res = await run([agent(), agent({ id: "a2", name: "Off", enabled: false })]);
    const text = textOf(res);
    expect(text).not.toContain("TOP-SECRET-PROMPT");
    expect(text).not.toContain("SCHEMA-LEAK");
    expect(text).not.toContain("system_prompt");
    expect(text).not.toContain("provider");
    expect(Object.keys(jsonOf(res).agents[0]).sort()).toEqual(["description", "enabled", "id", "model", "name"]);
    const out = jsonOf(res);
    expect(out.agents.map((a: { id: string }) => a.id)).toEqual(["a1"]);
    expect(out).toMatchObject({ count: 1, hidden_disabled: 1 });
  });

  it("include_disabled reveals disabled agents", async () => {
    const out = jsonOf(await run([agent(), agent({ id: "a2", name: "Off", enabled: false })], { include_disabled: true }));
    expect(out.agents).toHaveLength(2);
    expect(out.hidden_disabled).toBe(0);
  });

  it("empty list is a hint, not an error", async () => {
    const res = await run([]);
    expect(res.isError).toBeFalsy();
    const out = jsonOf(res);
    expect(out.agents).toEqual([]);
    expect(typeof out.hint).toBe("string");
  });

  it("description is cut to <=140 chars", async () => {
    const out = jsonOf(await run([agent({ description: "x".repeat(500) })]));
    expect(out.agents[0].description.length).toBeLessThanOrEqual(140);
  });
});

describe("list_agents untrusted labeling and sanitizing", () => {
  it("puts `untrusted` first and strips hidden characters from agent name/description", async () => {
    const text = textOf(await run([agent({ name: "Sec\u{E0041}\u202E", description: "d\u200Bx" })]));
    const out = JSON.parse(text);
    expect(Object.keys(out)[0]).toBe("untrusted");
    expect(out.agents[0]).toMatchObject({ name: "Sec", description: "dx" });
  });
});
