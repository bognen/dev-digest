/* LineChart — multi-series line chart on Recharts. Optional `tooltip` renders
   custom hover content for the hovered point index (e.g. run version + cost). */
import React from "react";
import {
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface ChartSeries {
  name: string;
  color: string;
  data: number[];
}

export function LineChart({
  series,
  w = 620,
  h = 200,
  yMin = 0.6,
  yMax = 1.0,
  tooltip,
  ariaLabel,
}: {
  series: ChartSeries[];
  w?: number;
  h?: number;
  yMin?: number;
  yMax?: number;
  /** Hover content for the point at `index`; omit for no tooltip. */
  tooltip?: (index: number) => React.ReactNode;
  ariaLabel?: string;
}) {
  const n = series[0]?.data.length ?? 0;
  const rows = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number> = { i };
    series.forEach((s) => {
      row[s.name] = s.data[i] ?? 0;
    });
    return row;
  });
  return (
    <div style={{ width: "100%", maxWidth: w, height: h }} role={ariaLabel ? "img" : undefined} aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={rows} margin={{ top: 14, right: 14, bottom: 8, left: -10 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 12, fill: "var(--text-muted)" }}
            tickFormatter={(v: number) => v.toFixed(1)}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          {tooltip && (
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              content={({ active, label }) =>
                active && typeof label === "number" ? (
                  <div
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 12,
                      boxShadow: "var(--shadow-modal)",
                    }}
                  >
                    {tooltip(label)}
                  </div>
                ) : null
              }
            />
          )}
          {series.map((s) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={tooltip ? { r: 2.5 } : false}
              isAnimationActive={false}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}
