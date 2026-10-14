/* RunHistoryTable — full eval runs newest first (AC-28): ran at, version, metric
   bars, pass count, cost; select exactly two runs to Compare (AC-29, AC-33). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { metricText, money, runTime, type MetricKey } from "@/lib/eval-format";
import { s } from "./styles";

const BARS: { key: MetricKey; color: string; label: "recall" | "precision" | "citation" }[] = [
  { key: "recall", color: "var(--accent)", label: "recall" },
  { key: "precision", color: "var(--ok)", label: "precision" },
  { key: "citation_accuracy", color: "var(--warn)", label: "citation" },
];

export function RunHistoryTable({
  runs,
  selected,
  onToggle,
  onCompare,
}: {
  runs: EvalSuiteRun[];
  selected: string[];
  onToggle: (id: string) => void;
  onCompare: () => void;
}) {
  const t = useTranslations("eval");
  const canCompare = selected.length === 2;

  return (
    <section aria-labelledby="eval-history-title">
      <div style={s.head}>
        <span id="eval-history-title" style={s.title}>
          <Icon.History size={14} /> {t("history.title")}
        </span>
        {selected.length > 0 && <span style={s.selected}>{t("history.selected", { count: selected.length })}</span>}
        <span style={s.spacer} />
        <Button
          kind="primary"
          size="sm"
          icon="GitMerge"
          disabled={!canCompare}
          title={canCompare ? undefined : t("history.compareHint")}
          onClick={onCompare}
        >
          {t("history.compare")}
        </Button>
      </div>
      {runs.length === 0 ? (
        <div style={s.empty}>{t("history.empty")}</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th} aria-hidden="true" />
                <th style={s.th}>{t("history.ranAt")}</th>
                <th style={s.th}>{t("history.version")}</th>
                {BARS.map((b) => (
                  <th key={b.key} style={s.th}>
                    {t(`history.${b.label}`)}
                  </th>
                ))}
                <th style={s.th}>{t("history.pass")}</th>
                <th style={s.th}>{t("history.cost")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const finished = r.status === "done" || r.status === "partial";
                const checked = selected.includes(r.id);
                return (
                  <tr key={r.id} style={s.tr(checked)}>
                    <td style={s.td}>
                      {finished && (
                        <Checkbox
                          checked={checked}
                          onChange={() => onToggle(r.id)}
                          label={
                            <span style={s.srOnly}>
                              {t("history.select", { version: r.agent_version, time: runTime(r.started_at) })}
                            </span>
                          }
                        />
                      )}
                    </td>
                    <td style={s.mono}>{runTime(r.started_at)}</td>
                    <td style={s.version}>v{r.agent_version}</td>
                    {finished ? (
                      BARS.map((b) => (
                        <td key={b.key} style={s.td}>
                          <span style={s.barCell}>
                            <span style={s.barTrack}>
                              <span style={s.barFill(b.color, r[b.key] ?? 0)} />
                            </span>
                            <span style={s.barText}>{metricText(r, b.key)}</span>
                          </span>
                        </td>
                      ))
                    ) : (
                      <td colSpan={3} style={s.status}>
                        {t(`history.status${r.status === "running" ? "Running" : "Failed"}`)}
                        {r.error ? ` — ${r.error}` : ""}
                      </td>
                    )}
                    <td style={s.pass}>
                      {r.traces_passed}/{r.traces_total}
                      {r.status === "partial" && <span style={s.partial}> · {t("history.statusPartial")}</span>}
                    </td>
                    <td style={s.mono}>{money(r.cost_usd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
