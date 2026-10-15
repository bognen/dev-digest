/* MultiRunResults — /multi-agent-review/:multiRunId. Ported from
   screen_multiagent.jsx (ScreenMultiAgent): header, meta row, Columns | Tabs,
   "Where agents disagree", and the run trace drawer (`?trace=<runId>`). */
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import RunTraceDrawer from "@/components/review/RunTraceDrawer";
import { formatCost, formatSeconds } from "@/lib/format";
import { useCancelMultiRun, useMultiRun } from "@/lib/hooks/multi-agent";
import { isActiveStatus } from "@/lib/multi-run";
import { ColumnsView } from "../ColumnsView";
import { TabsView } from "../TabsView";
import { Disagreements } from "../Disagreements";
import { TRACE_PARAM, VIEWS, type ResultsView } from "./constants";
import { configureHref, withTrace } from "./helpers";
import { s } from "./styles";

export function MultiRunResults({ multiRunId }: { multiRunId: string }) {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { data, isLoading, isError } = useMultiRun(multiRunId);
  const cancelAll = useCancelMultiRun(multiRunId);
  const [view, setView] = React.useState<ResultsView>("columns");

  const traceId = search.get(TRACE_PARAM);
  const traced = data?.children.find((c) => c.run_id === traceId) ?? null;
  const foreignTrace = !!data && !!traceId && !traced;

  // A `?trace=` that is not a child of this multi-run is dropped from the URL (AC-65a).
  React.useEffect(() => {
    if (foreignTrace) router.replace(withTrace(pathname, new URLSearchParams(search.toString()), null));
  }, [foreignTrace, router, pathname, search]);

  const setTrace = (runId: string | null) =>
    router.replace(withTrace(pathname, new URLSearchParams(search.toString()), runId), { scroll: false });

  const crumb = [{ label: t("crumb") }, ...(data ? [{ label: `#${data.pr_number}`, mono: true }] : [])];

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.loading} aria-busy="true" aria-label={t("results.loading")}>
          <Skeleton height={28} width="40%" />
        </div>
      </AppShell>
    );
  }
  if (isError || !data) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.errorWrap}>
          <ErrorState title={t("results.errorTitle")} body={t("results.errorBody")} />
          <div style={s.errorCta}>
            <Button kind="secondary" icon="Settings" onClick={() => router.push(configureHref(null))}>
              {t("results.configureRun")}
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }
  if (data.children.length === 0) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState
          icon="Cpu"
          title={t("results.emptyTitle")}
          body={t("results.emptyBody")}
          cta={t("results.configureRun")}
          onCta={() => router.push(configureHref(data.pr_id))}
        />
      </AppShell>
    );
  }

  const runs = data.children;
  const anyActive = runs.some((c) => isActiveStatus(c.status));

  return (
    <AppShell crumb={crumb}>
      <div style={s.header}>
        <button
          type="button"
          title={t("results.configureRunTitle")}
          onClick={() => router.push(configureHref(data.pr_id))}
          style={s.configure}
        >
          <Icon.Settings size={14} />
          {t("results.configureRun")}
        </button>
        <h1 style={s.h1}>{t("results.title")}</h1>
        <span style={s.count}>{t("results.selectedAgents", { count: runs.length })}</span>
        <div style={s.headerRight}>
          {anyActive && (
            <Button
              kind="danger"
              size="sm"
              loading={cancelAll.isPending}
              aria-label={t("results.cancelAllLabel")}
              onClick={() => cancelAll.mutate()}
            >
              {t("results.cancelAll")}
            </Button>
          )}
          <div role="group" aria-label={t("results.viewLabel")} style={s.toggle}>
            {VIEWS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={view === k}
                onClick={() => setView(k)}
                style={s.toggleBtn(view === k)}
              >
                {k === "columns" ? t("results.viewColumns") : t("results.viewTabs")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={s.meta}>
        <span className="mono" style={s.metaNumber}>
          #{data.pr_number}
        </span>
        <span style={s.metaTitle}>{data.pr_title}</span>
        <span style={s.metaRight}>
          <Icon.Cpu size={14} style={s.metaIcon} />
          {t("results.meta", {
            count: runs.length,
            time: formatSeconds(data.total_duration_ms),
            cost: formatCost(data.total_cost_usd, 2),
          })}
        </span>
      </div>

      {view === "columns" ? (
        <ColumnsView runs={runs} onViewTrace={setTrace} />
      ) : (
        <TabsView runs={runs} prId={data.pr_id} onViewTrace={setTrace} />
      )}
      <div style={s.disagree}>
        <Disagreements runs={runs} />
      </div>

      {traced && (
        <RunTraceDrawer
          key={traced.run_id}
          runId={traced.run_id}
          agentName={traced.agent_name ?? t("results.deletedAgent")}
          prNumber={data.pr_number}
          findings={traced.findings}
          running={isActiveStatus(traced.status)}
          onClose={() => setTrace(null)}
        />
      )}
    </AppShell>
  );
}
