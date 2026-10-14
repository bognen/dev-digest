/* EvalMetricCards — Recall / Precision / Citation accuracy KPI tiles (latest full
   run, delta in points vs the previous run, sparkline) + optional traces-passed tile. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MetricCard } from "@devdigest/ui";
import type { EvalMetricDelta, EvalRunPoint, EvalSuiteRun } from "@devdigest/shared";
import { metricText, type MetricKey } from "@/lib/eval-format";
import { s } from "./styles";

const TILES: { key: MetricKey; label: "recall" | "precision" | "citationAccuracy"; color: string }[] = [
  { key: "recall", label: "recall", color: "var(--accent)" },
  { key: "precision", label: "precision", color: "var(--ok)" },
  { key: "citation_accuracy", label: "citationAccuracy", color: "var(--warn)" },
];

export function EvalMetricCards({
  latest,
  delta,
  trend,
  showTraces,
}: {
  latest: EvalSuiteRun | null;
  delta: EvalMetricDelta | null;
  trend: EvalRunPoint[];
  showTraces?: boolean;
}) {
  const t = useTranslations("eval");
  return (
    <div style={s.row}>
      {TILES.map((tile) => {
        const text = latest ? metricText(latest, tile.key) : "—";
        const vacuous = !!latest?.vacuous?.[tile.key];
        const value = text.endsWith("%") ? text.slice(0, -1) : text;
        return (
          <div key={tile.key} style={s.cell} title={vacuous ? t("metrics.naHint") : undefined}>
            <MetricCard
              label={t(`metrics.${tile.label}`)}
              value={<span style={{ color: tile.color }}>{value}</span>}
              suffix={text.endsWith("%") ? "%" : undefined}
              delta={delta && !vacuous ? Math.round(delta[tile.key] * 100) : undefined}
              trend={trend.length > 1 ? trend.map((p) => p[tile.key]) : undefined}
              color={tile.color}
            />
          </div>
        );
      })}
      {showTraces && (
        <div style={s.cell}>
          <MetricCard
            label={t("metrics.tracesPassed")}
            value={latest ? `${latest.traces_passed}/${latest.traces_total}` : "—"}
          />
        </div>
      )}
    </div>
  );
}
