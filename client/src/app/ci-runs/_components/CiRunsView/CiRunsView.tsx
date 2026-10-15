/* CiRunsView — /ci-runs (design N13): header with auto-refresh indicator and
   Refresh, filter chips, and the shared CiRunsTable. Pulls from GitHub on open,
   every 60 s while open, and on Refresh (see useCiAutoPull). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { CiRunStatus } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { CiRunsTable, filterRuns, sortRunsNewestFirst, type CiRunFilters } from "@/components/ci-runs/CiRunsTable";
import { useCiRuns } from "@/lib/hooks";
import { notify } from "@/lib/toast";
import { agentOptions, cycleOption, repoOptions, statusOptions } from "./helpers";
import { s } from "./styles";
import { useCiAutoPull } from "./useCiAutoPull";

const STATUS_LABEL_KEY: Record<CiRunStatus, string> = {
  succeeded: "succeeded",
  no_findings: "noFindings",
  failed: "failed",
  skipped: "skipped",
  rejected: "rejected",
  result_expired: "resultExpired",
};

const INITIAL_FILTERS: CiRunFilters = { period: "7d", agentId: null, repo: null, status: null };

export function CiRunsView() {
  const t = useTranslations("ci");
  const router = useRouter();
  const runsQuery = useCiRuns();
  const { pull, isPulling } = useCiAutoPull();
  const [filters, setFilters] = React.useState<CiRunFilters>(INITIAL_FILTERS);
  const crumb = [{ label: t("page.crumb") }];

  const onRefresh = () =>
    pull({
      onSuccess: (r) =>
        notify.success(
          t("runs.refreshSummary", { accepted: r.accepted, rejected: r.rejected, failed: r.failed, skipped: r.skipped }),
        ),
      onError: () => notify.error(t("runs.refreshError")),
    });

  const all = runsQuery.data;
  const visible = React.useMemo(
    () => (all ? sortRunsNewestFirst(filterRuns(all, filters)) : []),
    [all, filters],
  );

  if (runsQuery.isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.state}>
          <Skeleton height={240} />
        </div>
      </AppShell>
    );
  }

  if (runsQuery.isError || !all) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.state}>
          <ErrorState
            title={t("runs.loadError")}
            body={(runsQuery.error as Error | null)?.message}
            onRetry={() => runsQuery.refetch()}
          />
        </div>
      </AppShell>
    );
  }

  if (all.length === 0) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState
          icon="Workflow"
          title={t("runs.emptyTitle")}
          body={
            <>
              {t("runs.emptyBody")}
              <span style={s.hint}>{t("runs.emptyHint")}</span>
            </>
          }
          cta={t("runs.emptyCta")}
          onCta={() => router.push("/agents")}
        />
      </AppShell>
    );
  }

  const agents = agentOptions(all);
  const selectedAgent = agents.find((a) => a.id === filters.agentId);
  const set = (patch: Partial<CiRunFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <AppShell crumb={crumb}>
      <header style={s.header}>
        <div>
          <h1 style={s.h1}>{t("runs.title")}</h1>
          <p style={s.subtitle}>{t("runs.subtitle")}</p>
        </div>
        <div style={s.actions}>
          <span style={s.autoRefresh}>
            <span style={s.dot} />
            {t("runs.autoRefresh")}
          </span>
          <Button kind="secondary" size="sm" icon="RefreshCw" loading={isPulling} onClick={onRefresh}>
            {isPulling ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>
      </header>

      <div style={s.filters}>
        <Chip
          icon="Calendar"
          active={filters.period === "7d"}
          onClick={() => set({ period: filters.period === "7d" ? "all" : "7d" })}
        >
          {t("runs.filters.last7Days")}
        </Chip>
        <Chip
          icon="Cpu"
          active={!!selectedAgent}
          onClick={() => set({ agentId: cycleOption(agents.map((a) => a.id), filters.agentId) })}
        >
          {selectedAgent ? selectedAgent.name : t("runs.filters.allAgents")}
        </Chip>
        <Chip
          icon="GitBranch"
          active={!!filters.repo}
          onClick={() => set({ repo: cycleOption(repoOptions(all), filters.repo) })}
        >
          {filters.repo ?? t("runs.filters.allRepos")}
        </Chip>
        <Chip
          active={!!filters.status}
          onClick={() => set({ status: cycleOption(statusOptions(all), filters.status) })}
        >
          {filters.status ? t(`runs.status.${STATUS_LABEL_KEY[filters.status]}`) : t("runs.filters.allStatuses")}
        </Chip>
        <Chip icon="Workflow">{t("runs.filters.allSources")}</Chip>
      </div>

      {visible.length === 0 ? (
        <div style={s.noMatch}>{t("runs.filters.noMatch")}</div>
      ) : (
        <CiRunsTable runs={visible} />
      )}
    </AppShell>
  );
}
