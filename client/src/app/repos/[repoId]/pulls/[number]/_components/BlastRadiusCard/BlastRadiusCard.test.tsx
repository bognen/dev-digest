import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as hooks from "@/lib/hooks/blast-radius";
import type { BlastRadiusResponse } from "@/lib/hooks/blast-radius";
import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(cleanup);

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function mockBlastRadius(data: BlastRadiusResponse | undefined, isLoading = false) {
  vi.spyOn(hooks, "useBlastRadius").mockReturnValue({
    data,
    isLoading,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useBlastRadius>);
}

describe("BlastRadiusCard (specs/07-blast-radius.md)", () => {
  it("shows the standard EmptyState when there are no changed symbols", () => {
    mockBlastRadius({
      status: "full",
      data: { changed_symbols: [], downstream: [] },
    });
    renderWithProviders(<BlastRadiusCard prId="pr1" />);
    expect(screen.getByText("No blast radius to show")).toBeInTheDocument();
  });

  it("lists every changed symbol as a row with its caller count, even when none have callers", () => {
    mockBlastRadius({
      status: "full",
      data: {
        changed_symbols: [
          { name: "helper", file: "src/utils/helper.ts", kind: "function" },
          { name: "other", file: "src/utils/other.ts", kind: "function" },
        ],
        downstream: [],
      },
    });
    renderWithProviders(<BlastRadiusCard prId="pr1" />);
    expect(screen.getByText("helper")).toBeInTheDocument();
    expect(screen.getByText("other")).toBeInTheDocument();
    // The stats line plus one "0 callers" per symbol row.
    expect(screen.getAllByText("0 callers")).toHaveLength(3);
    expect(screen.queryByText("No blast radius to show")).not.toBeInTheDocument();
  });

  it("renders a stats row summarizing symbols/callers/endpoints/crons", () => {
    mockBlastRadius({
      status: "full",
      data: {
        changed_symbols: [{ name: "helper", file: "src/utils/helper.ts", kind: "function" }],
        downstream: [
          {
            symbol: "helper",
            callers: [{ name: "handler", file: "src/api/route.ts", line: 10, rank: 5 }],
            endpoints_affected: ["GET /x"],
            crons_affected: ["nightly-job"],
          },
        ],
      },
    });
    renderWithProviders(<BlastRadiusCard prId="pr1" />);
    expect(screen.getByText("1 symbol")).toBeInTheDocument();
    // "1 caller" appears twice: the stats line AND the symbol row's caller count.
    expect(screen.getAllByText("1 caller")).toHaveLength(2);
    expect(screen.getByText("1 endpoint")).toBeInTheDocument();
    expect(screen.getByText("1 cron")).toBeInTheDocument();
  });

  it("renders downstream groups with caller file:line links and impacted endpoints/crons", () => {
    mockBlastRadius({
      status: "full",
      data: {
        changed_symbols: [{ name: "helper", file: "src/utils/helper.ts", kind: "function" }],
        downstream: [
          {
            symbol: "helper",
            callers: [{ name: "handler", file: "src/api/route.ts", line: 10, rank: 5 }],
            endpoints_affected: ["GET /x"],
            crons_affected: ["nightly-job"],
          },
        ],
      },
    });
    renderWithProviders(
      <BlastRadiusCard prId="pr1" repoFullName="acme/app" headSha="abc123" />,
    );

    expect(screen.getByText("helper")).toBeInTheDocument();
    // Callers, endpoints and crons are behind the row's expander.
    expect(screen.queryByText("src/api/route.ts:10")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /helper/ }));
    const link = screen.getByText("src/api/route.ts:10").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/app/blob/abc123/src/api/route.ts#L10",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("GET /x")).toBeInTheDocument();
    expect(screen.getByText("nightly-job")).toBeInTheDocument();
  });

  it("renders a distinct non-blocking banner for a 'partial' index, without hiding the real data", () => {
    mockBlastRadius({
      status: "partial",
      data: {
        changed_symbols: [{ name: "helper", file: "src/utils/helper.ts", kind: "function" }],
        downstream: [
          {
            symbol: "helper",
            callers: [{ name: "handler", file: "src/api/route.ts", line: 10, rank: 5 }],
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
      },
    });
    renderWithProviders(<BlastRadiusCard prId="pr1" />);
    expect(screen.getByRole("status")).toHaveTextContent(/partially built/i);
    expect(screen.getByText("helper")).toBeInTheDocument();
  });

  it("renders a DIFFERENT banner for a 'degraded' index than for 'partial'", () => {
    mockBlastRadius({
      status: "degraded",
      degradedReason: "no_data",
      data: { changed_symbols: [], downstream: [] },
    });
    renderWithProviders(<BlastRadiusCard prId="pr1" />);
    expect(screen.getByRole("status")).toHaveTextContent(/best-effort/i);
    expect(screen.getByRole("status")).toHaveTextContent(/no_data/);
  });

  it("renders no banner for a 'full' index", () => {
    mockBlastRadius({
      status: "full",
      data: { changed_symbols: [], downstream: [] },
    });
    renderWithProviders(<BlastRadiusCard prId="pr1" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("a 'partial' index with no_data (zero files indexed) explains the language gap, with no reason code", () => {
    mockBlastRadius({
      status: "partial",
      degradedReason: "no_data",
      data: {
        changed_symbols: [{ name: "run", file: "job.py", kind: "function" }],
        downstream: [],
      },
    });
    renderWithProviders(<BlastRadiusCard prId="pr1" />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/language isn't covered by the code index/i);
    expect(banner).not.toHaveTextContent(/partially built/i);
    expect(banner).not.toHaveTextContent(/no_data/);
  });
});
