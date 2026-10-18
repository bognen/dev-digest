/* AgentPerformanceView — /agent-performance. Global roll-up of the per-agent
   Stats tab: summary tiles, a sortable/expandable per-agent table and a cost
   breakdown by agent and model, for a 1-day / 30-day / custom range.
   Read-only: it only queries stored runs and findings (GET /agent-performance);
   reload, sort and expand never start a review or a model call. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { StatsRangePicker, useStatsRange } from "@/components/agent-stats/StatsRangePicker";
import { ApiError } from "@/lib/api";
import { useAgentPerformance } from "@/lib/hooks/agent-stats";
import { formatBound, pinnedRangeParams } from "@/lib/stats-range";
import { SummaryTiles } from "./_components/SummaryTiles";
import { PerformanceTable } from "./_components/PerformanceTable";
import { CostBreakdown } from "./_components/CostBreakdown";
import { agentColorMap } from "./helpers";
import { s } from "./styles";

export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  const router = useRouter();
  const { state, range, setState } = useStatsRange();
  const query = useAgentPerformance(range);
  const data = query.data;
  const period = t(`range.period.${state.preset}`);
  const crumb = [{ label: t("crumb") }];

  const header = (
    <div style={s.header}>
      <div>
        <h1 style={s.h1}>{t("title")}</h1>
        <p style={s.subtitle}>{t("subtitle")}</p>
      </div>
      <div style={s.actions}>
        <Button
          kind="secondary"
          size="sm"
          icon="RefreshCw"
          onClick={() => query.refetch()}
          disabled={!range || query.isFetching}
        >
          {t("refresh")}
        </Button>
        <StatsRangePicker state={state} invalid={!range} onChange={setState} />
      </div>
    </div>
  );

  const body = (() => {
    // Invalid custom range: the picker shows the hint; render nothing that could read as zero.
    if (!range) return null;
    if (query.isPending) {
      return (
        <div style={s.stack} aria-busy="true" data-testid="perf-loading">
          <div style={s.tilesSkeleton}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={132} />
            ))}
          </div>
          <Skeleton height={220} />
          <Skeleton height={200} />
        </div>
      );
    }
    if (query.isError || !data) {
      return (
        <ErrorState
          title={t("loadError")}
          body={query.error instanceof ApiError ? query.error.message : undefined}
          onRetry={() => query.refetch()}
        />
      );
    }
    if (data.agent_count === 0) {
      return (
        <EmptyState
          icon="Cpu"
          title={t("empty.noAgentsTitle")}
          body={t("empty.noAgentsBody")}
          cta={t("empty.noAgentsCta")}
          onCta={() => router.push("/agents")}
        />
      );
    }
    if (data.totals.runs === 0) {
      return (
        <EmptyState
          icon="Activity"
          title={t("empty.noRunsTitle")}
          body={t("empty.noRunsBody", {
            agents: data.agent_count,
            from: formatBound(data.range.from),
            to: formatBound(data.range.to),
          })}
        />
      );
    }
    const pinned = pinnedRangeParams(state, range);
    const colors = agentColorMap(data.agents);
    return (
      <div style={s.stack}>
        <SummaryTiles data={data} period={period} colors={colors} />
        <PerformanceTable
          rows={data.agents}
          minDecisions={data.min_decisions}
          period={period}
          pinned={pinned}
          colors={colors}
        />
        <CostBreakdown data={data} colors={colors} />
        <p style={s.rules}>{t("rules")}</p>
      </div>
    );
  })();

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {header}
        {body}
      </div>
    </AppShell>
  );
}
