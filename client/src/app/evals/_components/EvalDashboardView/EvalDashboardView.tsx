/* EvalDashboardView — /evals: every agent that has eval cases (model, last run,
   recall sparkline, current R/P/C) and the 20 most recent eval runs across all
   agents (AC-37, AC-38); "Run all agents" starts one run per agent (AC-40). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton, Sparkline } from "@devdigest/ui";
import type { EvalAgentSummary, EvalRecentRun } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useEvalOverview, useRunAllEvals } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import { metricText, runTime, type MetricKey } from "@/lib/eval-format";
import { s } from "./styles";

const METRICS: { key: MetricKey; label: "recall" | "precShort" | "citationShort"; color: string }[] = [
  { key: "recall", label: "recall", color: "var(--accent)" },
  { key: "precision", label: "precShort", color: "var(--ok)" },
  { key: "citation_accuracy", label: "citationShort", color: "var(--warn)" },
];

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const overview = useEvalOverview();
  const runAll = useRunAllEvals();
  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];

  const onRunAll = () =>
    runAll.mutate(undefined, {
      onSuccess: (r) => notify.success(t("dashboard.runAllDone", { started: r.started.length, skipped: r.skipped.length })),
      onError: (err) => notify.error((err as Error).message),
    });

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <header style={s.header}>
          <div>
            <h1 style={s.h1}>{t("dashboard.title")}</h1>
            <p style={s.subtitle}>{t("dashboard.subtitle")}</p>
          </div>
          <Button kind="primary" icon="Play" loading={runAll.isPending} onClick={onRunAll}>
            {t("dashboard.runAll")}
          </Button>
        </header>

        {overview.isLoading ? (
          <Skeleton height={240} />
        ) : overview.isError || !overview.data ? (
          <ErrorState title={t("dashboard.loadError")} body={(overview.error as Error | null)?.message} onRetry={() => overview.refetch()} />
        ) : overview.data.agents.length === 0 ? (
          <EmptyState icon="FlaskConical" title={t("dashboard.empty")} />
        ) : (
          <>
            <section aria-labelledby="eval-agents">
              <div id="eval-agents" style={s.sectionTitle}>
                <Icon.Cpu size={14} /> {t("dashboard.agents")}
              </div>
              <ul style={s.agentList}>
                {overview.data.agents.map((a) => (
                  <AgentRow key={a.agent_id} a={a} />
                ))}
              </ul>
            </section>
            <section aria-labelledby="eval-recent">
              <div id="eval-recent" style={s.sectionTitle}>
                <Icon.History size={14} /> {t("dashboard.recentAll")}
              </div>
              <RecentRuns runs={overview.data.recent_runs} />
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function AgentRow({ a }: { a: EvalAgentSummary }) {
  const t = useTranslations("eval");
  return (
    <li>
      <Link href={`/evals/agents/${a.agent_id}`} style={s.agentRow} aria-label={t("dashboard.openAgent", { name: a.name })}>
        <span style={s.agentIcon}>
          <Icon.Cpu size={18} />
        </span>
        <span style={s.agentMain}>
          <span style={s.agentName}>
            {a.name} <span style={s.model}>{a.model}</span>
            {a.running && <span style={s.running}>{t("dashboard.runningBadge")}</span>}
          </span>
          <span style={s.agentSub}>
            {a.latest
              ? t("dashboard.lastRun", {
                  version: a.latest.agent_version,
                  time: runTime(a.latest.started_at),
                  passed: a.latest.traces_passed,
                  total: a.latest.traces_total,
                })
              : t("dashboard.neverRun", { cases: a.cases_total })}
          </span>
        </span>
        {a.spark.length > 1 && <Sparkline data={a.spark} color="var(--accent)" w={90} h={28} />}
        {METRICS.map((m) => (
          <span key={m.key} style={s.metric}>
            <span style={s.metricLabel}>{t(`metrics.${m.label}`)}</span>
            <span style={{ ...s.metricValue, color: m.color }}>{a.latest ? metricText(a.latest, m.key) : "—"}</span>
          </span>
        ))}
        <Icon.ChevronRight size={16} style={s.chevron} />
      </Link>
    </li>
  );
}

function RecentRuns({ runs }: { runs: EvalRecentRun[] }) {
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} style={s.tr}>
              <td style={s.tdName}>{r.owner_name}</td>
              <td style={s.tdMono}>{runTime(r.started_at)}</td>
              <td style={s.tdVersion}>v{r.agent_version}</td>
              {METRICS.map((m) => (
                <td key={m.key} style={s.td}>
                  <span style={s.barCell}>
                    <span style={s.barTrack}>
                      <span style={s.barFill(m.color, r[m.key] ?? 0)} />
                    </span>
                    <span style={s.barText}>{metricText(r, m.key)}</span>
                  </span>
                </td>
              ))}
              <td style={s.tdPass}>
                {r.status === "running" ? "…" : `${r.traces_passed}/${r.traces_total}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
