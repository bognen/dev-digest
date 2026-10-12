import { describe, it, expect } from "vitest";
import { isSafeRepoPath, resolveBriefTarget, splitFileRef } from "./helpers";

const FILES = new Set(["src/a.ts", "src/b.ts", "docs/README.md", "src/Case.ts", "src/dir"]);

describe("resolveBriefTarget", () => {
  it("AC-1 / AC-5: an exact path resolves in_diff and passes the line through", () => {
    expect(resolveBriefTarget(FILES, "src/a.ts", 12)).toEqual({ kind: "in_diff", path: "src/a.ts", line: 12 });
    expect(resolveBriefTarget(FILES, "src/b.ts", null)).toEqual({ kind: "in_diff", path: "src/b.ts", line: null });
    // undefined line is normalised to null
    expect(resolveBriefTarget(FILES, "src/b.ts", undefined)).toEqual({ kind: "in_diff", path: "src/b.ts", line: null });
  });

  it("AC-7 / EC-1: a path not in the PR is not_in_diff", () => {
    expect(resolveBriefTarget(FILES, "x/y.ts", 3)).toEqual({ kind: "not_in_diff" });
  });

  it("AC-29 / NFR-4a: hostile or look-alike paths never match", () => {
    const hostile = [
      "../x",
      "../src/a.ts",
      "src/../src/a.ts",
      "./src/a.ts",
      "/src/a.ts",
      "javascript:alert(1)",
      "https://evil.example/src/a.ts",
      "src/case.ts", // case variant of src/Case.ts
      "SRC/A.TS", // case variant
      "src/a.ts/", // trailing slash
      "src/dir/", // trailing slash on an existing entry
      " src/a.ts", // leading whitespace (no trimming)
      "src/a.ts ", // trailing whitespace (no trimming)
      "src\\a.ts", // backslash variant
      "src/a.ts\0", // NUL suffix
      "src/a.ts:12", // raw ref, not split
      "src/old-name.ts", // renamed-away path (EC-2)
      "",
    ];
    for (const p of hostile) {
      expect(resolveBriefTarget(FILES, p, 1), JSON.stringify(p)).toEqual({ kind: "not_in_diff" });
    }
  });

  it("AC-29: an empty file set never resolves", () => {
    expect(resolveBriefTarget(new Set(), "src/a.ts", 1)).toEqual({ kind: "not_in_diff" });
  });

  it("untrusted line values are passed through untouched, never used to reject an in-diff file", () => {
    expect(resolveBriefTarget(FILES, "src/a.ts", -1)).toEqual({ kind: "in_diff", path: "src/a.ts", line: -1 });
    expect(resolveBriefTarget(FILES, "src/a.ts", 1e9)).toEqual({ kind: "in_diff", path: "src/a.ts", line: 1e9 });
  });
});

describe("splitFileRef (existing)", () => {
  it("splits a trailing :<digits> into the line and leaves other shapes whole", () => {
    expect(splitFileRef("a.ts:12")).toEqual({ file: "a.ts", line: 12 });
    expect(splitFileRef("b.ts")).toEqual({ file: "b.ts", line: undefined });
    expect(splitFileRef("c:d")).toEqual({ file: "c:d", line: undefined });
  });
});

describe("isSafeRepoPath", () => {
  it.each([
    "",
    "/etc/passwd",
    "src\\a.ts",
    "src/a\u0000.ts",
    "src/a\n.ts",
    "javascript:alert(1)",
    "https://evil.test/x",
    "../x",
    "src/../x",
    "./src/a.ts",
    "src/./a.ts",
    "src//a.ts",
    "src/a.ts/",
    "..",
    ".",
  ])("AC-29 / NFR-4: rejects %j", (p) => {
    expect(isSafeRepoPath(p)).toBe(false);
  });

  it.each(["src/a.ts", "docs/x y.md", ".github/workflows/ci.yml", "a.ts", "src/..a/b.ts"])(
    "AC-29 / NFR-4: accepts %j",
    (p) => {
      expect(isSafeRepoPath(p)).toBe(true);
    },
  );
});
