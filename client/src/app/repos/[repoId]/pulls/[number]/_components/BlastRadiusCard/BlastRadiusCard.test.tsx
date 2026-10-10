import { describe, it, expect, afterEach, vi, type Mock } from "vitest";
import { render, screen, cleanup, fireEvent, within, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import * as hooks from "@/lib/hooks/blast-radius";
import type { BlastRadiusResponse } from "@/lib/hooks/blast-radius";
import blast from "../../../../../../../../messages/en/blast.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCard(ui: React.ReactElement): RenderResult {
  const qc = new QueryClient();
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast }}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

function mockBlastRadius(data: BlastRadiusResponse | undefined, isLoading = false): Mock {
  return vi.spyOn(hooks, "useBlastRadius").mockReturnValue({
    data,
    isLoading,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useBlastRadius>) as unknown as Mock;
}

const HELPER = { name: "helper", file: "src/utils/helper.ts", kind: "function" };
const GROUP = {
  symbol: "helper",
  callers: [
    { name: "handler", file: "src/api/route.ts", line: 10, rank: 5 },
    { name: "other", file: "src/api/other.ts", line: 22, rank: 3 },
  ],
  endpoints_affected: ["GET /x"],
  crons_affected: ["nightly-job"],
};

describe("BlastRadiusCard (specs/07-blast-radius.md)", () => {
  it("shows a loading skeleton, then the standard EmptyState with no banner for an empty full index", () => {
    mockBlastRadius(undefined, true);
    const { unmount } = renderCard(<BlastRadiusCard prId="pr1" />);
    expect(screen.queryByText("No blast radius to show")).not.toBeInTheDocument();
    unmount();

    mockBlastRadius({ status: "full", data: { changed_symbols: [], downstream: [] } });
    renderCard(<BlastRadiusCard prId="pr1" />);
    expect(screen.getByText("No blast radius to show")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("symbols with zero callers show the noDownstream text and each symbol is still listed", () => {
    mockBlastRadius({
      status: "full",
      data: {
        changed_symbols: [HELPER, { name: "other", file: "src/utils/other.ts", kind: "function" }],
        downstream: [],
      },
    });
    renderCard(<BlastRadiusCard prId="pr1" />);

    expect(screen.getByText("2 changed symbols, no downstream callers found.")).toBeInTheDocument();
    const list = screen.getByRole("list");
    expect(within(list).getByText("helper")).toBeInTheDocument();
    expect(within(list).getByText("other")).toBeInTheDocument();
    expect(within(list).getAllByText("0 callers")).toHaveLength(2);
    // nothing to expand
    expect(screen.getByRole("button", { name: /helper/ })).toBeDisabled();
    expect(screen.queryByText("No blast radius to show")).not.toBeInTheDocument();
  });

  it("the expand icon opens the card in a modal dialog and the close button dismisses it", () => {
    mockBlastRadius({
      status: "full",
      data: { changed_symbols: [HELPER], downstream: [] },
    });
    renderCard(<BlastRadiusCard prId="pr1" />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show larger" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("helper")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a full index with a degradedReason (flag_off) shows a role=status banner containing the reason, and still lists the data", () => {
    mockBlastRadius({
      status: "full",
      degradedReason: "flag_off",
      data: { changed_symbols: [HELPER], downstream: [GROUP] },
    });
    renderCard(<BlastRadiusCard prId="pr1" />);

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/flag_off/);
    expect(screen.getByText("helper")).toBeInTheDocument();
  });

  it("a failed index shows a banner (and a partial one a different banner) without hiding the data", () => {
    mockBlastRadius({
      status: "failed",
      data: { changed_symbols: [HELPER], downstream: [GROUP] },
    });
    const { unmount } = renderCard(<BlastRadiusCard prId="pr1" />);
    const failedText = screen.getByRole("status").textContent;
    expect(failedText).toMatch(/failed/i);
    expect(screen.getByText("helper")).toBeInTheDocument();
    unmount();

    mockBlastRadius({
      status: "partial",
      data: { changed_symbols: [HELPER], downstream: [GROUP] },
    });
    renderCard(<BlastRadiusCard prId="pr1" />);
    const partialText = screen.getByRole("status").textContent;
    expect(partialText).toMatch(/partially built/i);
    expect(partialText).not.toBe(failedText);
  });

  it("a partial index with no_data explains the language gap, without the reason code", () => {
    mockBlastRadius({
      status: "partial",
      degradedReason: "no_data",
      data: { changed_symbols: [{ name: "run", file: "job.py", kind: "function" }], downstream: [] },
    });
    renderCard(<BlastRadiusCard prId="pr1" />);
    // the zero-callers note is also a status region; pick the banner by its text
    const banner = screen.getAllByRole("status").find((n) => /language/i.test(n.textContent ?? ""))!;
    expect(banner).toHaveTextContent(/language isn't covered by the code index/i);
    expect(banner).not.toHaveTextContent(/no_data/);
  });

  it("stats line uses singular forms for a count of 1 and plural forms otherwise", () => {
    const one = {
      symbol: "helper",
      callers: [{ name: "handler", file: "src/api/route.ts", line: 10, rank: 5 }],
      endpoints_affected: ["GET /x"],
      crons_affected: ["nightly-job"],
    };
    mockBlastRadius({ status: "full", data: { changed_symbols: [HELPER], downstream: [one] } });
    const { unmount } = renderCard(<BlastRadiusCard prId="pr1" />);
    for (const text of ["1 symbol", "1 caller", "1 endpoint", "1 cron job"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("1 symbols")).not.toBeInTheDocument();
    expect(screen.queryByText("1 callers")).not.toBeInTheDocument();
    unmount();

    const two = {
      ...GROUP,
      endpoints_affected: ["GET /x", "POST /y"],
      crons_affected: ["nightly-job", "weekly-job"],
    };
    mockBlastRadius({
      status: "full",
      data: {
        changed_symbols: [HELPER, { name: "other", file: "src/utils/other.ts", kind: "function" }],
        downstream: [two],
      },
    });
    renderCard(<BlastRadiusCard prId="pr1" />);
    for (const text of ["2 symbols", "2 callers", "2 endpoints", "2 cron jobs"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
  });

  it("each index state renders its exact banner wording", () => {
    const data = { changed_symbols: [HELPER], downstream: [GROUP] };
    const bannerText = (): string =>
      screen
        .getAllByRole("status")
        .map((n) => n.textContent ?? "")
        .join("\n");

    const cases: Array<[BlastRadiusResponse, string, string?]> = [
      [
        { status: "partial", data },
        "This repo's index is only partially built — some callers or impacted endpoints may be missing.",
      ],
      [
        { status: "degraded", data },
        "This repo's index isn't available yet — showing a best-effort, less precise blast radius.",
      ],
      [
        { status: "failed", data },
        "Indexing this repo failed — results may be missing callers or impacted endpoints. Try Resync.",
      ],
      [
        { status: "full", degradedReason: "flag_off", data },
        "The index reported a problem — some callers or impacted endpoints may be missing.",
        "flag_off",
      ],
    ];
    for (const [response, text, reason] of cases) {
      mockBlastRadius(response);
      const { unmount } = renderCard(<BlastRadiusCard prId="pr1" />);
      expect(bannerText()).toContain(text);
      if (reason) expect(bannerText()).toContain(reason);
      unmount();
    }

    mockBlastRadius({
      status: "partial",
      degradedReason: "no_data",
      data: { changed_symbols: [HELPER], downstream: [GROUP] },
    });
    renderCard(<BlastRadiusCard prId="pr1" />);
    expect(bannerText()).toContain(
      "Best-effort scan — this repo's language isn't covered by the code index, so some callers or endpoints may be missing.",
    );
    expect(bannerText()).not.toContain("no_data");
    expect(bannerText()).not.toContain("only partially built");
  });

  it("expanding a row shows file:line links to the exact GitHub line, then the endpoints and crons", () => {
    mockBlastRadius({ status: "full", data: { changed_symbols: [HELPER], downstream: [GROUP] } });
    renderCard(<BlastRadiusCard prId="pr1" repoFullName="acme/app" headSha="abc123" />);

    // stats line + the symbol row both report the caller count
    expect(screen.getAllByText("2 callers")).toHaveLength(2);
    expect(screen.queryByText("src/api/route.ts:10")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /helper/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const first = screen.getByText("src/api/route.ts:10").closest("a")!;
    expect(first).toHaveAttribute("href", "https://github.com/acme/app/blob/abc123/src/api/route.ts#L10");
    expect(first).toHaveAttribute("target", "_blank");
    const second = screen.getByText("src/api/other.ts:22").closest("a")!;
    expect(second).toHaveAttribute("href", "https://github.com/acme/app/blob/abc123/src/api/other.ts#L22");

    const endpoint = screen.getByText("GET /x");
    const cron = screen.getByText("nightly-job");
    // callers first, then endpoints, then crons
    expect(first.compareDocumentPosition(endpoint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(endpoint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(endpoint.compareDocumentPosition(cron) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.queryByText("src/api/route.ts:10")).not.toBeInTheDocument();
  });

  describe("Tree/Graph view toggle", () => {
    const withData = (extra: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse => ({
      status: "full",
      data: { changed_symbols: [HELPER], downstream: [GROUP] },
      ...extra,
    });

    it("defaults to Tree, switches to the graph svg and back, keeping stats and banner visible", () => {
      mockBlastRadius(withData({ status: "partial" }));
      renderCard(<BlastRadiusCard prId="pr1" repoFullName="acme/app" headSha="abc123" />);

      const treeBtn = screen.getByRole("button", { name: "tree" });
      const graphBtn = screen.getByRole("button", { name: "graph" });
      expect(treeBtn).toHaveAttribute("aria-pressed", "true");
      expect(graphBtn).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("list")).toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();

      fireEvent.click(graphBtn);
      expect(graphBtn).toHaveAttribute("aria-pressed", "true");
      expect(treeBtn).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
      // banner and stats stay visible in graph view
      expect(screen.getByRole("status")).toHaveTextContent(/partially built/i);
      expect(screen.getByText("1 symbol")).toBeInTheDocument();
      expect(screen.getByText("2 callers")).toBeInTheDocument();
      expect(screen.getByText("1 endpoint")).toBeInTheDocument();

      fireEvent.click(treeBtn);
      expect(treeBtn).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("list")).toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("shows the graph empty state when symbols have no callers", () => {
      mockBlastRadius({ status: "full", data: { changed_symbols: [HELPER], downstream: [] } });
      renderCard(<BlastRadiusCard prId="pr1" />);
      fireEvent.click(screen.getByRole("button", { name: "graph" }));
      expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("has no toggle when there are no rows (EmptyState)", () => {
      mockBlastRadius({ status: "full", data: { changed_symbols: [], downstream: [] } });
      renderCard(<BlastRadiusCard prId="pr1" />);
      expect(screen.getByText("No blast radius to show")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "tree" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "graph" })).not.toBeInTheDocument();
    });
  });
});
