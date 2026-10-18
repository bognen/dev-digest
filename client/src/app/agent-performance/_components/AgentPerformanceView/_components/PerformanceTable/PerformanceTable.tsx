/* PerformanceTable — one row per agent for the period: Runs, Avg cost, Avg
   duration, Accept rate (with accepted/decided denominator and a low-sample
   flag), Last run, View (→ the agent's Stats tab on the same range).
   Sorting and expanding are local state only — no fetch, no model call. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { AgentPerfRow } from "@devdigest/shared";
import { formatCost, formatRate, formatSeconds, relativeTime } from "@/lib/format";
import { writeRangeParams, type StatsRangeState } from "@/lib/stats-range";
import { DEFAULT_SORT } from "../../constants";
import { acceptColor, nextSort, sortRows, type SortKey, type SortState } from "../../helpers";
import { s } from "./styles";

const COLUMNS: ReadonlyArray<{ key: SortKey; labelKey: string }> = [
  { key: "agent", labelKey: "table.agent" },
  { key: "runs", labelKey: "table.runs" },
  { key: "avgCost", labelKey: "table.avgCost" },
  { key: "avgDuration", labelKey: "table.avgDuration" },
  { key: "accept", labelKey: "table.accept" },
  { key: "lastRun", labelKey: "table.lastRun" },
];

export function PerformanceTable({
  rows,
  minDecisions,
  period,
  pinned,
  colors,
}: {
  rows: AgentPerfRow[];
  minDecisions: number;
  period: string;
  /** Range params that reproduce this exact window on the Stats tab. */
  pinned: StatsRangeState;
  colors: ReadonlyMap<string, string>;
}) {
  const t = useTranslations("agentPerformance");
  const [sort, setSort] = React.useState<SortState>(DEFAULT_SORT);
  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set());
  const sorted = React.useMemo(() => sortRows(rows, sort), [rows, sort]);
  const statsQs = writeRangeParams(new URLSearchParams({ tab: "stats" }), pinned).toString();

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div style={s.card}>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.thExpand} />
            {COLUMNS.map((c) => {
              const label = t(c.labelKey, { period });
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  style={s.th}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    style={{ ...s.sortBtn, ...(active ? s.sortBtnActive : null) }}
                    aria-label={t("table.sortAria", { column: label })}
                    onClick={() => setSort((cur) => nextSort(cur, c.key))}
                  >
                    {label}
                    {active && (sort.dir === "asc" ? <Icon.ArrowUp size={11} /> : <Icon.ArrowDown size={11} />)}
                  </button>
                </th>
              );
            })}
            <th style={s.th}>
              <span style={s.srOnly}>{t("table.view")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const expanded = open.has(r.agent_id);
            return (
              <React.Fragment key={r.agent_id}>
                <tr data-testid={`perf-row-${r.agent_id}`}>
                  <td style={s.tdExpand}>
                    <button
                      type="button"
                      style={s.expandBtn}
                      aria-expanded={expanded}
                      aria-label={t(expanded ? "table.collapseAria" : "table.expandAria", { name: r.agent_name })}
                      onClick={() => toggle(r.agent_id)}
                    >
                      {expanded ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
                    </button>
                  </td>
                  <td style={s.td}>
                    <span style={s.agent}>
                      <span style={{ ...s.agentIcon, color: colors.get(r.agent_id) }}>
                        <Icon.Cpu size={14} />
                      </span>
                      <span style={s.agentName}>{r.agent_name}</span>
                    </span>
                  </td>
                  {r.runs === 0 ? (
                    <td style={s.idle} colSpan={5}>
                      {t("table.noRuns")}
                    </td>
                  ) : (
                    <>
                      <td style={s.num} className="mono tnum">
                        {r.runs}
                      </td>
                      <td style={s.num} className="mono tnum">
                        {formatCost(r.avg_cost_usd)}
                      </td>
                      <td style={s.num} className="mono tnum">
                        {formatSeconds(r.avg_duration_ms)}
                      </td>
                      <td style={s.num}>
                        <span style={s.accept}>
                          <span className="tnum" style={{ ...s.acceptValue, color: acceptColor(r) }}>
                            {formatRate(r.accept_rate)}
                          </span>
                          <span style={s.denominator} className="mono tnum" data-testid="row-denominator">
                            {t("table.decided", { accepted: r.accepted, decided: r.decided })}
                          </span>
                          {r.low_sample && r.decided > 0 && (
                            <span title={t("table.lowSampleHint", { min: minDecisions })}>
                              <Badge color="var(--text-muted)">{t("table.lowSample")}</Badge>
                            </span>
                          )}
                        </span>
                      </td>
                      <td style={s.muted}>{relativeTime(r.last_run_at)}</td>
                    </>
                  )}
                  <td style={s.td}>
                    <Link
                      href={`/agents/${r.agent_id}?${statsQs}`}
                      style={s.view}
                      aria-label={t("table.viewAria", { name: r.agent_name })}
                    >
                      {t("table.view")}
                    </Link>
                  </td>
                </tr>
                {expanded && (
                  <tr style={s.detailRow}>
                    <td />
                    <td colSpan={COLUMNS.length + 1} style={s.detailCell}>
                      <RowDetail row={r} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <p style={s.note}>{t("table.acceptSortNote", { min: minDecisions })}</p>
    </div>
  );
}

/** Expanded-row detail, built from the row already loaded (no request). */
function RowDetail({ row }: { row: AgentPerfRow }) {
  const t = useTranslations("agentPerformance");
  return (
    <div style={s.detail}>
      <div style={s.detailBlock}>
        <span style={s.detailLabel}>{t("table.detail.costByModel")}</span>
        {row.cost_by_model.length === 0 ? (
          <span style={s.detailMuted}>{t("table.detail.noModelCost")}</span>
        ) : (
          row.cost_by_model.map((m) => (
            <span key={m.model ?? "unknown"} style={s.detailLine}>
              <span className="mono">{m.model ?? t("table.detail.unknownModel")}</span>
              <span className="mono tnum">
                {m.runs} · {formatCost(m.cost_usd)}
              </span>
            </span>
          ))
        )}
      </div>
      <div style={s.detailBlock}>
        <span style={s.detailLabel}>{t("table.detail.decisions")}</span>
        <span style={s.detailLine}>
          {t("table.detail.decisionsValue", { accepted: row.accepted, dismissed: row.dismissed })}
        </span>
      </div>
      <div style={s.detailBlock}>
        <span style={s.detailLabel}>{t("table.detail.pricedRuns")}</span>
        <span style={s.detailLine}>
          {t("table.detail.pricedRunsValue", { priced: row.priced_runs, runs: row.runs })}
        </span>
      </div>
    </div>
  );
}
