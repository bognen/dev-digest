/* SummaryTiles — Total runs (+ per-day sparkline), Total cost (with its cost
   basis and unpriced-run count), Avg accept rate (with its denominator) and
   the Most-active agent (by runs in the period). */
import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Icon, Sparkline } from "@devdigest/ui";
import type { AgentPerformance } from "@devdigest/shared";
import { CostBasisBadge } from "@/components/agent-stats/CostBasisBadge";
import { formatCost, formatRate } from "@/lib/format";
import { s } from "./styles";

export function SummaryTiles({
  data,
  period,
  colors,
}: {
  data: AgentPerformance;
  period: string;
  colors: ReadonlyMap<string, string>;
}) {
  const t = useTranslations("agentPerformance");
  const { totals, most_active: active } = data;
  const spark = data.runs_by_day.map((p) => p.value);
  const ratePct = totals.accept_rate == null ? null : Math.round(totals.accept_rate * 100);
  const agentsWithRuns = data.agents.filter((a) => a.runs > 0).length;

  return (
    <div style={s.grid}>
      <section style={s.tile} aria-label={t("summary.totalRuns", { period })}>
        <span style={s.label}>{t("summary.totalRuns", { period })}</span>
        <span style={s.value} className="tnum" data-testid="total-runs">
          {totals.runs}
        </span>
        <span style={s.meta}>{t("summary.totalRunsHint", { agents: agentsWithRuns })}</span>
        {spark.length > 1 && (
          <div style={s.spark}>
            <Sparkline data={spark} w={240} h={32} />
          </div>
        )}
      </section>

      <section style={s.tile} aria-label={t("summary.totalCost", { period })}>
        <div style={s.labelRow}>
          <span style={s.label}>{t("summary.totalCost", { period })}</span>
          <CostBasisBadge basis={data.cost_basis} />
        </div>
        <span style={s.value} className="tnum" data-testid="total-cost">
          {formatCost(totals.total_cost_usd)}
        </span>
        {totals.unpriced_runs > 0 && <span style={s.meta}>{t("summary.unpriced", { count: totals.unpriced_runs })}</span>}
      </section>

      <section style={s.tile} aria-label={t("summary.avgAcceptRate")}>
        <div style={s.labelRow}>
          <span style={s.label}>{t("summary.avgAcceptRate")}</span>
          {ratePct != null && <CircularScore score={ratePct} size={40} stroke={4} />}
        </div>
        <span style={s.value} className="tnum" data-testid="avg-accept">
          {formatRate(totals.accept_rate)}
        </span>
        <span style={s.meta} data-testid="accept-denominator">
          {totals.decided > 0
            ? t("summary.acceptDenominator", { accepted: totals.accepted, decided: totals.decided })
            : t("summary.noDecisions")}
        </span>
      </section>

      <section style={s.tile} aria-label={t("summary.mostActive")}>
        <span style={s.label}>{t("summary.mostActive")}</span>
        {active ? (
          <div style={s.active}>
            <span style={{ ...s.agentIcon, color: colors.get(active.agent_id) }}>
              <Icon.Cpu size={15} />
            </span>
            <div style={s.activeText}>
              <span style={s.activeName} data-testid="most-active">
                {active.agent_name}
              </span>
              <span style={s.meta}>
                {t("summary.mostActiveMeta", {
                  runs: active.runs,
                  rate: formatRate(active.accept_rate),
                  decided: active.decided,
                })}
              </span>
            </div>
          </div>
        ) : (
          <span style={s.value}>{t("summary.none")}</span>
        )}
      </section>
    </div>
  );
}
