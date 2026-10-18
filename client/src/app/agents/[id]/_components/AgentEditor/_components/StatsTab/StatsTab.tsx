/* StatsTab — one agent's runs, cost, duration and accept rate for a 1-day /
   30-day / custom range (GET /agents/:id/stats). Uses the same aggregation
   and range model as the Agent Performance dashboard, so its headline numbers
   equal that agent's dashboard row for the same range. Read-only. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, EmptyState, ErrorState, SectionLabel, Skeleton, Sparkline } from "@devdigest/ui";
import type { AgentStats } from "@devdigest/shared";
import { CostBasisBadge } from "@/components/agent-stats/CostBasisBadge";
import { StatsRangePicker, useStatsRange } from "@/components/agent-stats/StatsRangePicker";
import { ApiError } from "@/lib/api";
import { formatCost, formatRate, formatSeconds, relativeTime } from "@/lib/format";
import { useAgentStats } from "@/lib/hooks/agent-stats";
import { formatBound, writeRangeParams } from "@/lib/stats-range";
import { SEVERITIES } from "./constants";
import { s } from "./styles";

export function StatsTab({ agentId, agentName }: { agentId: string; agentName: string }) {
  const t = useTranslations("agents");
  const { state, range, setState } = useStatsRange();
  const query = useAgentStats(agentId, range);
  const dashboardHref = `/agent-performance?${writeRangeParams(new URLSearchParams(), state).toString()}`;

  const body = (() => {
    if (!range) return null;
    if (query.isPending) {
      return (
        <div style={s.stack} aria-busy="true" data-testid="stats-loading">
          <Skeleton height={110} />
          <Skeleton height={180} />
        </div>
      );
    }
    if (query.isError || !query.data) {
      return (
        <ErrorState
          title={t("stats.loadError")}
          body={query.error instanceof ApiError ? query.error.message : undefined}
          onRetry={() => query.refetch()}
        />
      );
    }
    const st = query.data;
    if (st.runs === 0) {
      return (
        <EmptyState
          icon="Activity"
          title={t("stats.emptyTitle")}
          body={t("stats.emptyBody", { name: agentName, from: formatBound(st.range.from), to: formatBound(st.range.to) })}
        />
      );
    }
    return <StatsBody st={st} />;
  })();

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div>
          <h2 style={s.h2}>{t("stats.title")}</h2>
          <p style={s.subtitle}>
            {t("stats.subtitle")}{" "}
            <Link href={dashboardHref} style={s.link}>
              {t("stats.openDashboard")}
            </Link>
          </p>
        </div>
        <div style={s.picker}>
          <StatsRangePicker state={state} invalid={!range} onChange={setState} />
        </div>
      </div>
      {body}
    </div>
  );
}

function StatsBody({ st }: { st: AgentStats }) {
  const t = useTranslations("agents");
  const trend = st.trend.map((p) => p.value);
  return (
    <div style={s.stack}>
      <div style={s.tiles}>
        <Tile label={t("stats.runs")} value={st.runs} testId="stats-runs" />
        <Tile
          label={t("stats.totalCost")}
          value={formatCost(st.total_cost_usd)}
          testId="stats-total-cost"
          aside={<CostBasisBadge basis={st.cost_basis} />}
          meta={st.unpriced_runs > 0 ? t("stats.unpriced", { count: st.unpriced_runs }) : undefined}
        />
        <Tile label={t("stats.avgCost")} value={formatCost(st.avg_cost_usd)} testId="stats-avg-cost" />
        <Tile label={t("stats.avgDuration")} value={formatSeconds(st.avg_duration_ms)} testId="stats-avg-duration" />
        <Tile
          label={t("stats.acceptRate")}
          value={formatRate(st.accept_rate)}
          testId="stats-accept"
          meta={
            st.decided > 0
              ? t("stats.acceptDenominator", { accepted: st.accepted, decided: st.decided })
              : t("stats.noDecisions")
          }
          warn={st.low_sample && st.decided > 0 ? t("stats.lowSample", { min: st.min_decisions }) : undefined}
        />
        <Tile label={t("stats.lastRun")} value={relativeTime(st.last_run_at)} />
      </div>

      <div style={s.panels}>
        <Card>
          <SectionLabel icon="ListChecks">{t("stats.findings")}</SectionLabel>
          <p style={s.meta}>{t("stats.findingsTotal", { total: st.findings_total, pending: st.pending })}</p>
          <div style={s.kv}>
            <span>{t("stats.accepted")}</span>
            <span className="mono tnum">{st.accepted}</span>
            <span>{t("stats.dismissed")}</span>
            <span className="mono tnum">{st.dismissed}</span>
            <span>{t("stats.pending")}</span>
            <span className="mono tnum">{st.pending}</span>
          </div>
          <p style={{ ...s.meta, marginTop: 14 }}>{t("stats.severity")}</p>
          <div style={s.kv}>
            {SEVERITIES.map((sev) => (
              <React.Fragment key={sev}>
                <span>{sev}</span>
                <span className="mono tnum">{st.findings_by_severity[sev]}</span>
              </React.Fragment>
            ))}
          </div>
        </Card>
        <Card>
          <SectionLabel icon="DollarSign" right={<CostBasisBadge basis={st.cost_basis} />}>
            {t("stats.costByModel")}
          </SectionLabel>
          <div style={s.kv}>
            {st.cost_by_model.map((m) => (
              <React.Fragment key={m.model ?? "unknown"}>
                <span className="mono">{m.model ?? t("stats.unknownModel")}</span>
                <span className="mono tnum">
                  {m.runs} · {formatCost(m.cost_usd)}
                </span>
              </React.Fragment>
            ))}
          </div>
          <p style={{ ...s.meta, marginTop: 18 }}>{t("stats.costBySkill")}</p>
          <div style={s.kv} data-testid="stats-cost-by-skill">
            {st.cost_by_skill.map((k) => (
              <React.Fragment key={k.skill_id ?? "none"}>
                <span style={k.skill_id ? undefined : s.muted}>{k.skill_name ?? t("stats.noSkill")}</span>
                <span className="mono tnum">
                  {k.runs} · {formatCost(k.cost_usd)}
                </span>
              </React.Fragment>
            ))}
          </div>
          <p style={{ ...s.meta, marginTop: 6 }}>{t("stats.costBySkillHint")}</p>
          {trend.length > 1 && (
            <>
              <p style={{ ...s.meta, marginTop: 18 }}>{t("stats.runsPerDay")}</p>
              <Sparkline data={trend} w={320} h={36} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  meta,
  warn,
  aside,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  meta?: string;
  warn?: string;
  aside?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div style={s.tile}>
      <div style={s.tileHead}>
        <span style={s.tileLabel}>{label}</span>
        {aside}
      </div>
      <span style={s.tileValue} className="tnum" data-testid={testId}>
        {value}
      </span>
      {meta && <span style={s.meta}>{meta}</span>}
      {warn && <span style={s.warn}>{warn}</span>}
    </div>
  );
}
