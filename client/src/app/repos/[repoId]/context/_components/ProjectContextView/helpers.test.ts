import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadMarkdown, downloadName } from "./helpers";

afterEach(() => vi.restoreAllMocks());

describe("downloadName", () => {
  it("uses the last path segment", () => {
    expect(downloadName("specs/a.md")).toBe("a.md");
    expect(downloadName("docs/guide/deep/b.md")).toBe("b.md");
    expect(downloadName("c.md")).toBe("c.md");
  });
  it("falls back for an empty tail", () => {
    expect(downloadName("docs/")).toBe("document.md");
  });
});

describe("downloadMarkdown", () => {
  it("saves a Blob under the file name, then cleans up the link and object URL", () => {
    const create = vi.fn(() => "blob:x");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("a.md");
      expect(this.href).toBe("blob:x");
    });
    downloadMarkdown("specs/a.md", "# Hi");
    expect(click).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:x");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
