import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NOT_IMPLEMENTED_MESSAGE,
  makeGetBlastRadiusHandler,
} from "../../src/tools/get-blast-radius.js";

describe("get_blast_radius stub", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the not-implemented notice and never touches the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const handler = makeGetBlastRadiusHandler();
    const result = await handler({ repo: "acme/api", pr: 42 });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: NOT_IMPLEMENTED_MESSAGE }]);
    expect(NOT_IMPLEMENTED_MESSAGE).toContain("get_findings(repo, pr)");
  });
});
