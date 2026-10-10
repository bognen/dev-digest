import { describe, expect, it, vi } from "vitest";
import { AmbiguousMatchError, ApiSchemaError, NotFoundError } from "../src/errors.js";
import type { ApiClient } from "../src/ports.js";
import { resolveAgent, resolvePull, resolveRepo } from "../src/resolve.js";

function fakeApi(routes: Record<string, unknown>): ApiClient & { get: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(async (path: string) => {
      if (!(path in routes)) throw new Error(`unexpected GET ${path}`);
      return routes[path];
    }),
    post: vi.fn(async () => {
      throw new Error("resolve must never POST");
    }),
  };
}

const repos = [
  { id: "r1", owner: "acme", name: "api", full_name: "acme/api" },
  { id: "r2", owner: "acme", name: "web", full_name: "acme/web" },
  { id: "r3", owner: "other", name: "web", full_name: "other/web" },
];

describe("resolveRepo", () => {
  it("matches full_name case-insensitively", async () => {
    const api = fakeApi({ "/repos": repos });
    expect(await resolveRepo(api, "  ACME/Api ")).toEqual({ id: "r1", fullName: "acme/api" });
  });

  it("accepts a bare name when unique", async () => {
    expect(await resolveRepo(fakeApi({ "/repos": repos }), "api")).toEqual({ id: "r1", fullName: "acme/api" });
  });

  it("rejects an ambiguous bare name listing the candidates", async () => {
    const err = await resolveRepo(fakeApi({ "/repos": repos }), "web").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AmbiguousMatchError);
    expect((err as AmbiguousMatchError).candidates).toEqual(["acme/web", "other/web"]);
  });

  it("throws NotFoundError with at most 10 known repos as candidates", async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `i${i}`,
      owner: "o",
      name: `n${i}`,
      full_name: `o/n${i}`,
    }));
    const err = await resolveRepo(fakeApi({ "/repos": many }), "o/missing").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).kind).toBe("repo");
    expect((err as NotFoundError).candidates).toHaveLength(10);
  });

  it("surfaces a schema mismatch as ApiSchemaError", async () => {
    await expect(resolveRepo(fakeApi({ "/repos": [{ nope: 1 }] }), "a/b")).rejects.toBeInstanceOf(ApiSchemaError);
  });
});

describe("resolvePull", () => {
  const repo = { id: "r1", fullName: "acme/api" };
  const path = "/repos/r1/pulls";

  it("finds a PR by number and returns its internal id", async () => {
    const api = fakeApi({ [path]: [{ id: "p42", number: 42, title: "Fix" }, { id: "p7", number: 7, title: "Other" }] });
    expect(await resolvePull(api, repo, 42)).toEqual({ id: "p42", number: 42, title: "Fix" });
  });

  it("treats a null id (not synced) as not found and lists available numbers", async () => {
    const api = fakeApi({ [path]: [{ id: null, number: 42, title: "x" }, { id: "p7", number: 7, title: "y" }] });
    const err = await resolvePull(api, repo, 42).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toMatchObject({ kind: "pr", input: "42", scope: "acme/api", candidates: ["7"] });
  });

  it("passes request options (long timeout) through to the client", async () => {
    const api = fakeApi({ [path]: [{ id: "p1", number: 1, title: "t" }] });
    await resolvePull(api, repo, 1, { timeoutMs: 30_000 });
    expect(api.get).toHaveBeenCalledWith(path, { timeoutMs: 30_000 });
  });

  it("url-encodes the repo id in the path", async () => {
    const api = fakeApi({ "/repos/a%2Fb/pulls": [{ id: "p1", number: 1, title: "t" }] });
    expect((await resolvePull(api, { id: "a/b", fullName: "x/y" }, 1)).id).toBe("p1");
  });
});

describe("resolveAgent", () => {
  const agents = [
    { id: "id-1", name: "Security", description: "d", provider: "openai", model: "m", enabled: true },
    { id: "id-2", name: "Style", description: null, provider: "openai", model: "m", enabled: false },
  ];

  it("matches exact id first, then case-insensitive exact name", async () => {
    const api = fakeApi({ "/agents": agents });
    expect(await resolveAgent(api, "id-2")).toEqual({ id: "id-2", name: "Style", enabled: false });
    expect(await resolveAgent(api, "security")).toEqual({ id: "id-1", name: "Security", enabled: true });
  });

  it("does not do partial name matching; NotFoundError lists known agent names", async () => {
    const err = await resolveAgent(fakeApi({ "/agents": agents }), "Sec").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toMatchObject({ kind: "agent", candidates: ["Security", "Style"] });
  });

  it("flags duplicate names as ambiguous", async () => {
    const dup = [...agents, { ...agents[0]!, id: "id-3" }];
    await expect(resolveAgent(fakeApi({ "/agents": dup }), "Security")).rejects.toBeInstanceOf(AmbiguousMatchError);
  });
});
