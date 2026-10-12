import { describe, it, expect } from "vitest";
import { parsePatch, type Line } from "./helpers";
import { resolveFocusLine, scrollBehaviorFor } from "./focus";

// Hunk 1 header at index 0: new-side lines 10..13 (indices 1..4).
// Hunk 2 header at index 5: new-side lines 51..53 (indices 6..9; the `-` row has no newNo).
const PATCH = [
  "@@ -10,4 +10,4 @@",
  " ctx ten",
  "+added eleven",
  " ctx twelve",
  " ctx thirteen",
  "@@ -40,3 +51,3 @@",
  " ctx fifty-one",
  "-removed",
  "+added fifty-two",
  " ctx fifty-three",
].join("\n");

const HUNK_1 = 0;
const HUNK_2 = 5;

describe("resolveFocusLine", () => {
  const lines = parsePatch(PATCH);

  it("AC-2: a line inside a hunk resolves to that exact add/ctx row", () => {
    const add = resolveFocusLine(lines, 11);
    expect(add.kind).toBe("line");
    if (add.kind === "line") {
      expect(lines[add.index]).toMatchObject({ kind: "add", newNo: 11 });
    }
    const ctx = resolveFocusLine(lines, 53);
    expect(ctx.kind).toBe("line");
    if (ctx.kind === "line") {
      expect(lines[ctx.index]).toMatchObject({ kind: "ctx", newNo: 53 });
    }
  });

  it("AC-3: a null line resolves to the file header", () => {
    expect(resolveFocusLine(lines, null)).toEqual({ kind: "header" });
  });

  it("AC-8 / EC-3: no parsed lines resolves to no_diff (even with a line)", () => {
    expect(resolveFocusLine([], null)).toEqual({ kind: "no_diff" });
    expect(resolveFocusLine(parsePatch(null), 5)).toEqual({ kind: "no_diff" });
    expect(resolveFocusLine(parsePatch(undefined), 5)).toEqual({ kind: "no_diff" });
  });

  it("AC-4: a line outside every hunk resolves to the nearest hunk header", () => {
    // above all hunks
    expect(resolveFocusLine(lines, 1)).toEqual({ kind: "hunk", index: HUNK_1 });
    // between: closer to hunk 1 (end 13) than hunk 2 (start 51)
    expect(resolveFocusLine(lines, 20)).toEqual({ kind: "hunk", index: HUNK_1 });
    // between: closer to hunk 2
    expect(resolveFocusLine(lines, 45)).toEqual({ kind: "hunk", index: HUNK_2 });
    // below all hunks
    expect(resolveFocusLine(lines, 500)).toEqual({ kind: "hunk", index: HUNK_2 });
  });

  it("AC-4: an exact tie between two hunks goes to the earlier hunk", () => {
    // 13 -> 32 is 19, 32 -> 51 is 19
    expect(resolveFocusLine(lines, 32)).toEqual({ kind: "hunk", index: HUNK_1 });
    expect(resolveFocusLine(lines, 33)).toEqual({ kind: "hunk", index: HUNK_2 });
  });

  it("EC-6: a deleted file (only '-' rows, no new-side lines) resolves to the hunk", () => {
    const deleted = parsePatch(["@@ -1,2 +0,0 @@", "-gone one", "-gone two"].join("\n"));
    expect(resolveFocusLine(deleted, 1)).toEqual({ kind: "hunk", index: 0 });
    expect(resolveFocusLine(deleted, null)).toEqual({ kind: "header" });
  });

  it("EC-2 / untrusted: negative, huge, fractional and NaN lines never throw and land on a hunk", () => {
    for (const bad of [-5, 0, 1e9, Number.MAX_SAFE_INTEGER, 11.5, 12.25, NaN, Infinity, -Infinity]) {
      let res: ReturnType<typeof resolveFocusLine> | undefined;
      expect(() => {
        res = resolveFocusLine(lines, bad);
      }).not.toThrow();
      // A fractional line never equals an integer newNo, so it is never a "line" hit.
      expect(res?.kind, `line ${bad}`).toBe("hunk");
    }
    expect(resolveFocusLine(lines, -5)).toEqual({ kind: "hunk", index: HUNK_1 });
    expect(resolveFocusLine(lines, 1e9)).toEqual({ kind: "hunk", index: HUNK_2 });
    // non-finite -> first hunk
    expect(resolveFocusLine(lines, NaN)).toEqual({ kind: "hunk", index: HUNK_1 });
    expect(resolveFocusLine(lines, Infinity)).toEqual({ kind: "hunk", index: HUNK_1 });
  });

  it("falls back to the header when lines contain no hunk header and no match", () => {
    const noHunk: Line[] = [{ kind: "ctx", text: "x", oldNo: 1, newNo: 1 }];
    expect(resolveFocusLine(noHunk, 99)).toEqual({ kind: "header" });
  });
});

describe("scrollBehaviorFor", () => {
  it("AC-27: reduced motion preference gives instant scrolling", () => {
    const win = { matchMedia: (q: string) => ({ matches: q === "(prefers-reduced-motion: reduce)" }) };
    expect(scrollBehaviorFor(win)).toBe("auto");
  });

  it("AC-27: no preference, no matchMedia, or no window allows smooth scrolling", () => {
    expect(scrollBehaviorFor({ matchMedia: () => ({ matches: false }) })).toBe("smooth");
    expect(scrollBehaviorFor({})).toBe("smooth");
    expect(scrollBehaviorFor(undefined)).toBe("smooth");
  });
});
