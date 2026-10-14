import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { dashboard, renderWithProviders } from "../_test/harness";

/** SPEC-06 AC-49/AC-50: one point per run; the hover tooltip shows version, time, metrics, cost. */

// Recharts measures 0×0 in jsdom, so render the chart's tooltip for each point directly.
vi.mock("@devdigest/ui", async (orig) => ({
  ...(await orig<typeof import("@devdigest/ui")>()),
  LineChart: ({ series, tooltip }: { series: { data: number[] }[]; tooltip?: (i: number) => React.ReactNode }) => (
    <div data-testid="chart" data-series={series.length}>
      {series[0]!.data.map((_, i) => (
        <div key={i} data-testid="tip">
          {tooltip?.(i)}
        </div>
      ))}
    </div>
  ),
}));

import { MetricTrendChart } from "./MetricTrendChart";

afterEach(cleanup);

describe("MetricTrendChart", () => {
  it("plots three series with a tooltip per run", () => {
    renderWithProviders(<MetricTrendChart points={dashboard().trend} />);
    expect(screen.getByTestId("chart").dataset.series).toBe("3");
    const tips = screen.getAllByTestId("tip");
    expect(tips).toHaveLength(2);
    expect(tips[1]).toHaveTextContent(/^v7 · 2026-05-29/);
    expect(tips[1]).toHaveTextContent("recall 82% · precision 91% · citation 95%");
    expect(tips[1]).toHaveTextContent("cost $0.23");
  });

  it("shows the empty hint before the first run", () => {
    renderWithProviders(<MetricTrendChart points={[]} />);
    expect(screen.getByText("The trend appears after the first full run.")).toBeInTheDocument();
  });
});
