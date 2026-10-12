import { describe, it, expect } from "vitest";
import { reorderPaths } from "./helpers";

describe("reorderPaths", () => {
  const paths = ["a.md", "b.md", "c.md"];

  it("AC-12/AC-18: moves the active path to the over path's position and returns the new order", () => {
    expect(reorderPaths(paths, "a.md", "c.md")).toEqual(["b.md", "c.md", "a.md"]);
    expect(reorderPaths(paths, "c.md", "a.md")).toEqual(["c.md", "a.md", "b.md"]);
    expect(paths).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("same position and unknown ids leave the order unchanged", () => {
    expect(reorderPaths(paths, "b.md", "b.md")).toEqual(paths);
    expect(reorderPaths(paths, "zzz.md", "a.md")).toEqual(paths);
    expect(reorderPaths(paths, "a.md", "zzz.md")).toEqual(paths);
  });
});
