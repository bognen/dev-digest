import { describe, it, expect } from "vitest";
import { NAV, SHORTCUTS, resolveHref } from "./nav";

describe("nav registry", () => {
  const section = (name: string) => NAV.find((g) => g.section === name)!;

  it("lists Conventions in the SKILLS LAB section, not in WORKSPACE", () => {
    const lab = section("SKILLS LAB").items.map((i) => i.key);
    expect(lab).toEqual(["skills", "agents", "conventions", "eval", "ci-runs"]);
    expect(section("WORKSPACE").items.map((i) => i.key)).not.toContain("conventions");
  });

  it("points Conventions at the repo-scoped route with the g c shortcut", () => {
    const item = section("SKILLS LAB").items.find((i) => i.key === "conventions")!;
    expect(item).toMatchObject({ label: "Conventions", icon: "ListChecks", gKey: "c" });
    expect(resolveHref(item.href, "repo-9")).toBe("/repos/repo-9/conventions");
    expect(SHORTCUTS).toContainEqual({ keys: "g c", label: "Go to Conventions", group: "Navigation" });
  });

  it("lists Project Context in WORKSPACE without a g-nav shortcut", () => {
    const item = section("WORKSPACE").items.find((i) => i.key === "context")!;
    expect(item).toMatchObject({ label: "Project Context", icon: "FileText" });
    expect(item.gKey).toBeUndefined();
    expect(resolveHref(item.href, "r")).toBe("/repos/r/context");
  });

  it("lists Onboarding Tour in WORKSPACE without a g-nav shortcut", () => {
    const item = section("WORKSPACE").items.find((i) => i.key === "onboarding-tour")!;
    expect(item).toMatchObject({ label: "Onboarding Tour", icon: "Layers" });
    expect(item.gKey).toBeUndefined();
    expect(resolveHref(item.href, "r1")).toBe("/repos/r1/onboarding");
  });

  it("keeps every g-nav shortcut key unique", () => {
    const keys = NAV.flatMap((g) => g.items).flatMap((i) => (i.gKey ? [i.gKey] : []));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("Eval Dashboard nav item (SPEC-06 AC-36)", () => {
  it("is in SKILLS LAB and links to /evals", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB")!;
    const item = lab.items.find((i) => i.key === "eval")!;
    expect(item).toMatchObject({ label: "Eval Dashboard", href: "/evals" });
  });
});

describe("CI Runs nav item (SPEC-07)", () => {
  it("is in SKILLS LAB after Eval Dashboard and links to /ci-runs", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB")!;
    expect(lab.items.map((i) => i.key).slice(-2)).toEqual(["eval", "ci-runs"]);
    expect(lab.items.find((i) => i.key === "ci-runs")).toMatchObject({ label: "CI Runs", icon: "Workflow", href: "/ci-runs" });
  });
});

describe("Agent Performance nav item", () => {
  it("is in GLOBAL after Multi-Agent Review and links to /agent-performance", () => {
    const global = NAV.find((g) => g.section === "GLOBAL")!;
    expect(global.items.map((i) => i.key)).toEqual(["multi-agent", "agent-performance"]);
    expect(global.items[1]).toMatchObject({ label: "Agent Performance", icon: "Activity", href: "/agent-performance" });
  });
});

describe("every nav item has a shell.nav translation (command palette)", () => {
  it("resolves nav.<key> for each item", async () => {
    const shell = (await import("../../../messages/en/shell.json")).default as { nav: Record<string, string> };
    for (const g of NAV) for (const it of g.items) expect(shell.nav[it.key], it.key).toBeTruthy();
  });
});
