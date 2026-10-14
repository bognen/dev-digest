/* AgentEvalDashboard — /evals/agents/:id (AC-39): back link, agent name + model,
   "N runs on the M-case gold set", agent switcher, period filter (7/30/90/all,
   default 30), Run eval, then the shared EvalsPanel in dashboard layout
   (banner, KPI cards, trend, history + Compare). */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, SelectInput, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { EvalsPanel } from "@/components/evals/EvalsPanel";
import { useAgent, useAgents } from "@/lib/hooks/agents";
import { useEvalDashboard } from "@/lib/hooks/eval";
import { DEFAULT_DAYS, PERIOD_OPTIONS } from "./constants";
import { s } from "./styles";

export function AgentEvalDashboard({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const agent = useAgent(agentId);
  const agents = useAgents();
  const [days, setDays] = React.useState(DEFAULT_DAYS);
  const dash = useEvalDashboard("agent", agentId, days);

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/evals" },
    { label: agent.data?.name ?? "…" },
  ];

  if (agent.isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("dashboard.loadError")} body={(agent.error as Error).message} onRetry={() => agent.refetch()} />
      </AppShell>
    );
  }

  const header = (
    <>
      <SelectInput
        value={agentId}
        onChange={(id) => router.push(`/evals/agents/${id}`)}
        options={(agents.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
      />
      <SelectInput
        value={String(days)}
        onChange={(v) => setDays(Number(v))}
        options={PERIOD_OPTIONS.map((d) => ({
          value: String(d),
          label: d === 0 ? t("dashboard.allTime") : t("dashboard.days", { days: d }),
        }))}
      />
    </>
  );

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/evals" style={s.back}>
          <Icon.ChevronLeft size={16} /> {t("dashboard.allAgents")}
        </Link>
        {!agent.data ? (
          <Skeleton height={60} />
        ) : (
          <header>
            <h1 style={s.h1}>
              {agent.data.name} <span style={s.model}>{agent.data.model}</span>
            </h1>
            {dash.data && (
              <p style={s.subtitle}>
                {t("dashboard.agentSubtitle", { runs: dash.data.history.length, cases: dash.data.cases_total })}
              </p>
            )}
          </header>
        )}
        {agent.data && (
          <EvalsPanel
            key={agentId}
            ownerKind="agent"
            ownerId={agentId}
            ownerName={agent.data.name}
            variant="dashboard"
            days={days}
            headerActions={header}
          />
        )}
      </div>
    </AppShell>
  );
}
