/* MetricTrendChart — recall / precision / citation per full run (AC-49); hover a
   point for its agent version, time, metrics and cost (AC-50). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LineChart, Icon } from "@devdigest/ui";
import type { EvalRunPoint } from "@devdigest/shared";
import { money, pct, runTime } from "@/lib/eval-format";
import { TREND_Y_MIN_FLOOR } from "./constants";
import { s } from "./styles";

export function MetricTrendChart({ points }: { points: EvalRunPoint[] }) {
  const t = useTranslations("eval");
  const series = [
    { name: t("trend.legendRecall"), color: "var(--accent)", data: points.map((p) => p.recall) },
    { name: t("trend.legendPrecision"), color: "var(--ok)", data: points.map((p) => p.precision) },
    { name: t("trend.legendCitation"), color: "var(--warn)", data: points.map((p) => p.citation_accuracy) },
  ];
  const lowest = Math.min(1, ...series.flatMap((x) => x.data));
  const yMin = Math.max(0, Math.min(TREND_Y_MIN_FLOOR, Math.floor(lowest * 10) / 10));

  return (
    <section style={s.card} aria-labelledby="eval-trend-title">
      <div style={s.head}>
        <span id="eval-trend-title" style={s.title}>
          <Icon.TrendingUp size={14} /> {t("trend.title")}
        </span>
        <span style={s.legend}>
          {series.map((x) => (
            <span key={x.name} style={s.legendItem}>
              <span style={s.swatch(x.color)} />
              {x.name}
            </span>
          ))}
        </span>
      </div>
      {points.length === 0 ? (
        <div style={s.empty}>{t("trend.empty")}</div>
      ) : (
        <LineChart
          series={series}
          w={2000}
          h={220}
          yMin={yMin}
          yMax={1}
          ariaLabel={t("trend.chartLabel")}
          tooltip={(i) => {
            const p = points[i];
            if (!p) return null;
            return (
              <div>
                <div style={s.tipHead}>{t("trend.tooltipHead", { version: p.agent_version, time: runTime(p.ran_at) })}</div>
                <div>
                  {t("trend.tooltipMetrics", {
                    recall: pct(p.recall),
                    precision: pct(p.precision),
                    citation: pct(p.citation_accuracy),
                  })}
                </div>
                <div>{t("trend.tooltipCost", { cost: money(p.cost_usd) })}</div>
              </div>
            );
          }}
        />
      )}
    </section>
  );
}
