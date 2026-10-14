/* EvalsPanel — one owner's (agent or skill) eval workspace: regression banner,
   KPI cards, case list with run/edit/delete + New case, metric trend, run history
   with Compare. Used by the Agent and Skill editors' Evals tab ("tab") and by
   the per-agent Eval Dashboard page ("dashboard", no case list). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton } from "@devdigest/ui";
import type { EvalCaseDetail, EvalOwnerKind } from "@devdigest/shared";
import {
  useDeleteEvalCase,
  useEvalCases,
  useEvalDashboard,
  useEvalRun,
  useRunEvalCase,
  useStartEvalRun,
} from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { passingCount } from "@/lib/eval-format";
import { CaseEditorModal } from "../CaseEditorModal";
import { CaseList } from "../CaseList";
import { CompareRunsModal } from "../CompareRunsModal";
import { EvalMetricCards } from "../EvalMetricCards";
import { MetricTrendChart } from "../MetricTrendChart";
import { RegressionBanner } from "../RegressionBanner";
import { RunHistoryTable } from "../RunHistoryTable";
import { ALL_TIME } from "./constants";
import { s } from "./styles";

export function EvalsPanel({
  ownerKind,
  ownerId,
  ownerName,
  variant = "tab",
  days = ALL_TIME,
  hostAgentId,
  runBlockedReason,
  headerActions,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
  ownerName: string;
  variant?: "tab" | "dashboard";
  /** History/trend period in days; 0 = all time. */
  days?: number;
  /** Skill evals: the host agent (undefined = server default). */
  hostAgentId?: string;
  /** When set, running is disabled and this hint is shown (AC-63). */
  runBlockedReason?: string | null;
  /** Extra controls for the header (dashboard: switcher, period). */
  headerActions?: React.ReactNode;
}) {
  const t = useTranslations("eval");
  const dash = useEvalDashboard(ownerKind, ownerId, days);
  const cases = useEvalCases(ownerKind, ownerId);
  const startRun = useStartEvalRun();
  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase();
  const [editing, setEditing] = React.useState<EvalCaseDetail | "new" | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState<[string, string] | null>(null);
  const [caseRun, setCaseRun] = React.useState<{ caseId: string; runId: string } | null>(null);
  const caseRunState = useEvalRun(caseRun?.runId);
  const busyCaseId = caseRun && caseRunState.data?.status !== "done" && caseRunState.data?.status !== "partial" && caseRunState.data?.status !== "failed" ? caseRun.caseId : null;

  const running = !!dash.data?.running || startRun.isPending;
  const runDisabled = running || !!runBlockedReason;
  const caseList = cases.data ?? [];

  const onRunAll = () =>
    startRun.mutate(
      { ownerKind, ownerId, ...(hostAgentId ? { hostAgentId } : {}) },
      { onError: (err) => notify.error((err as Error).message) },
    );

  const onRunCase = (c: EvalCaseDetail) =>
    runCase.mutate(
      { caseId: c.id, ...(hostAgentId ? { hostAgentId } : {}) },
      {
        onSuccess: (r) => setCaseRun({ caseId: c.id, runId: r.id }),
        onError: (err) => notify.error((err as Error).message),
      },
    );

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2)));

  if (dash.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={90} />
        <Skeleton height={220} />
      </div>
    );
  }
  if (dash.isError || !dash.data) {
    return <EmptyState icon="AlertTriangle" title={(dash.error as Error | null)?.message ?? t("dashboard.loadError")} />;
  }
  const data = dash.data;

  const runButton = (
    <Button
      kind={variant === "dashboard" ? "primary" : "secondary"}
      icon="Play"
      loading={running}
      disabled={runDisabled || caseList.length === 0}
      title={runBlockedReason ?? undefined}
      onClick={onRunAll}
    >
      {running ? t("cases.running") : variant === "dashboard" ? t("dashboard.runEval") : t("cases.runAll")}
    </Button>
  );

  return (
    <div style={s.wrap}>
      {variant === "dashboard" && (
        <div style={s.dashHead}>
          {headerActions}
          {runButton}
        </div>
      )}
      {runBlockedReason && <div style={s.hint}>{runBlockedReason}</div>}
      <RegressionBanner text={data.alert} />
      {data.running && <div style={s.runningNote}>{t("panel.running", { done: data.running.traces_total })}</div>}

      {variant === "tab" && (
        <div style={s.sectionHead}>
          <span style={s.sectionTitle}>{t("panel.metricsTitle")}</span>
          {ownerKind === "agent" && (
            <Link href={`/evals/agents/${ownerId}`} style={s.link}>
              {t("panel.viewDashboard")}
            </Link>
          )}
        </div>
      )}
      <EvalMetricCards latest={data.latest} delta={data.delta} trend={data.trend} showTraces={variant === "tab"} />
      {!data.latest && <div style={s.hint}>{t("panel.noRunsYet")}</div>}

      {variant === "tab" && (
        <section aria-labelledby="eval-cases-title">
          <div style={s.casesHead}>
            <h3 id="eval-cases-title" style={s.h3}>
              {t("cases.heading")}
            </h3>
            {caseList.length > 0 && (
              <span style={s.passing}>{t("cases.passing", { passed: passingCount(caseList), total: caseList.length })}</span>
            )}
            <span style={s.spacer} />
            {runButton}
            <Button kind="primary" icon="Plus" onClick={() => setEditing("new")}>
              {t("cases.newCase")}
            </Button>
          </div>
          {cases.isLoading ? (
            <Skeleton height={120} />
          ) : caseList.length === 0 ? (
            <EmptyState
              icon="FlaskConical"
              title={t("cases.emptyTitle")}
              body={t("cases.emptyBody")}
              cta={t("cases.newCase")}
              onCta={() => setEditing("new")}
            />
          ) : (
            <CaseList
              cases={caseList}
              busyCaseId={busyCaseId}
              runDisabled={runDisabled}
              onRun={onRunCase}
              onEdit={(c) => setEditing(c)}
              onDelete={(c) =>
                deleteCase.mutate(c.id, { onError: (err) => notify.error((err as Error).message) })
              }
            />
          )}
        </section>
      )}

      <MetricTrendChart points={data.trend} />
      <RunHistoryTable
        runs={data.history}
        selected={selected}
        onToggle={toggle}
        onCompare={() => selected.length === 2 && setComparing([selected[0]!, selected[1]!])}
      />

      {editing && (
        <CaseEditorModal
          ownerKind={ownerKind}
          ownerId={ownerId}
          ownerName={ownerName}
          existing={editing === "new" ? null : editing}
          {...(hostAgentId ? { hostAgentId } : {})}
          runDisabled={!!runBlockedReason}
          onClose={() => setEditing(null)}
        />
      )}
      {comparing && <CompareRunsModal runIds={comparing} onClose={() => setComparing(null)} />}
    </div>
  );
}
