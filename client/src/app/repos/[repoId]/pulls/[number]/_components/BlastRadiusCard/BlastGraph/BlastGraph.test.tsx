import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import blast from "../../../../../../../../../messages/en/blast.json";
import { BlastGraph } from "./BlastGraph";
import type { GraphSymbolInput } from "./helpers";

afterEach(cleanup);

function renderGraph(props: React.ComponentProps<typeof BlastGraph>): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast }}>
      <BlastGraph {...props} />
    </NextIntlClientProvider>,
  );
}

function symbolWith(nCallers: number, endpoints: string[] = [], crons: string[] = []): GraphSymbolInput {
  const group = {
    symbol: "helper",
    callers: Array.from({ length: nCallers }, (_, i) => ({ name: `c${i}`, file: `src/f${i}.ts`, line: i + 10, rank: 1 })),
    endpoints_affected: endpoints,
    crons_affected: crons,
  } as DownstreamImpact;
  return { key: "helper:h.ts", name: "helper", group };
}

describe("BlastGraph", () => {
  it("shows the empty state text, and no svg, when no symbol has callers", () => {
    renderGraph({ symbols: [{ key: "k", name: "helper" }, symbolWith(0)] });
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("links callers to the exact GitHub line when repo and sha are known, plain text otherwise", () => {
    const symbols = [symbolWith(2, ["GET /x"])];
    const { unmount } = renderGraph({ symbols, repoFullName: "acme/app", headSha: "abc123" });
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    const link = screen.getByText("src/f0.ts:10").closest("a")!;
    expect(link).toHaveAttribute("href", "https://github.com/acme/app/blob/abc123/src/f0.ts#L10");
    expect(screen.getByText("src/f1.ts:11").closest("a")).toHaveAttribute(
      "href",
      "https://github.com/acme/app/blob/abc123/src/f1.ts#L11",
    );
    unmount();

    renderGraph({ symbols, repoFullName: "acme/app" });
    expect(screen.getByText("src/f0.ts:10")).toBeInTheDocument();
    expect(screen.getByText("src/f0.ts:10").closest("a")).toBeNull();
  });

  it("collapses callers beyond the cap of 5 into a +k more node and shows endpoints and crons", () => {
    renderGraph({ symbols: [symbolWith(8, ["GET /x"], ["nightly-job"])] });
    for (let i = 0; i < 5; i++) expect(screen.getByText(`src/f${i}.ts:${i + 10}`)).toBeInTheDocument();
    expect(screen.queryByText("src/f5.ts:15")).not.toBeInTheDocument();
    expect(screen.getByText("+3 more")).toBeInTheDocument();
    expect(screen.getAllByText("GET /x").length).toBeGreaterThan(0);
    expect(screen.getAllByText("nightly-job").length).toBeGreaterThan(0);
  });
});
