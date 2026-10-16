/* ConfigureRun — /multi-agent-review. Ported from screen_multiagent.jsx
   (RunConfig): pick a PR (step 1), pick the agents to fan out (step 2), run.
   Creates a multi-run and opens its results page. Below the form, the
   repo's previous runs (PreviousRuns) link to their results. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, Icon, Skeleton, type DropdownItemDef } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEstimates, useCreateMultiRun } from "@/lib/hooks/multi-agent";
import { usePulls } from "@/lib/hooks/core";
import { useActiveRepo } from "@/lib/repo-context";
import { agentColor } from "@/lib/agent-color";
import { formatCost, formatSeconds } from "@/lib/format";
import { AGENTS_HREF, CONNECT_REPO_HREF, PR_DROPDOWN_WIDTH, PR_PARAM } from "./constants";
import { estimateFor, estimateTotals, listablePrs } from "./helpers";
import { AgentPickCard } from "./_components/AgentPickCard";
import { PreviousRuns } from "./_components/PreviousRuns";
import { s } from "./styles";

function StepHeader({ n, active, children }: { n: number; active: boolean; children: React.ReactNode }) {
  return (
    <>
      <span style={s.stepBadge(active)}>{n}</span>
      <span style={s.stepLabel(active)}>{children}</span>
    </>
  );
}

export function ConfigureRun() {
  const t = useTranslations("multiAgent");
  const tRuns = useTranslations("runs");
  const router = useRouter();
  const search = useSearchParams();
  const { activeRepo, repoId, reposLoaded } = useActiveRepo();
  const pulls = usePulls(repoId);
  const agentsQ = useAgents();
  const estimatesQ = useAgentEstimates();
  const create = useCreateMultiRun();

  const prs = listablePrs(pulls.data);
  // The PR choice is derived: an explicit pick wins, else a listable `?pr=`.
  const [pickedPrId, setPickedPrId] = React.useState<string | null>(null);
  const paramPrId = search.get(PR_PARAM);
  const prId = pickedPrId ?? (prs.some((p) => p.id === paramPrId) ? paramPrId : null);
  const pr = prs.find((p) => p.id === prId) ?? null;

  const enabled = (agentsQ.data ?? []).filter((a) => a.enabled);
  // Excluded ids: every enabled agent starts selected without an effect.
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
  const selected = enabled.filter((a) => !excluded.has(a.id));
  const allOn = enabled.length > 0 && selected.length === enabled.length;

  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totals = estimateTotals(
    selected.map((a) => a.id),
    estimatesQ.data?.estimates,
  );

  const run = () => {
    if (!prId || selected.length === 0 || create.isPending) return;
    create.mutate(
      { prId, agent_ids: selected.map((a) => a.id) },
      { onSuccess: (res) => router.push(`/multi-agent-review/${encodeURIComponent(res.multi_run_id)}`) },
    );
  };

  const crumb = [{ label: t("crumb") }, { label: t("config.crumb") }];

  // Mutually exclusive screen states: loading / no repo / no PRs / no agents / ready.
  if (!reposLoaded || pulls.isLoading || agentsQ.isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={28} width="60%" />
        </div>
      </AppShell>
    );
  }
  if (!activeRepo) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState
          icon="GitBranch"
          title={t("config.noRepo.title")}
          body={t("config.noRepo.body")}
          cta={t("config.noRepo.cta")}
          onCta={() => router.push(CONNECT_REPO_HREF)}
        />
      </AppShell>
    );
  }
  if (prs.length === 0) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState icon="GitPullRequest" title={t("config.noPrs.title")} body={t("config.noPrs.body")} />
        {repoId && (
          <div style={s.page}>
            <PreviousRuns repoId={repoId} />
          </div>
        )}
      </AppShell>
    );
  }
  if (enabled.length === 0) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState
          icon="Cpu"
          title={tRuns("page.noAgents.title")}
          body={tRuns("page.noAgents.body")}
          cta={tRuns("page.noAgents.cta")}
          onCta={() => router.push(AGENTS_HREF)}
        />
      </AppShell>
    );
  }

  const prItems: DropdownItemDef[] = prs.map((p) => ({
    label: t("config.prItem", { number: p.number, title: p.title }),
    icon: "GitPullRequest",
    onClick: () => setPickedPrId(p.id),
  }));

  const runLabel =
    selected.length > 1
      ? t("config.runMulti", { count: selected.length })
      : selected.length === 1
        ? t("config.runOne")
        : t("config.runNone");

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <h1 style={s.h1}>{t("config.title")}</h1>
        <p style={s.subtitle}>{t("config.subtitle")}</p>

        <div style={s.stepRow}>
          <StepHeader n={1} active>
            {t("config.step1")}
          </StepHeader>
        </div>
        <div style={s.prWrap}>
          <Dropdown
            width={PR_DROPDOWN_WIDTH}
            align="left"
            items={prItems}
            trigger={
              <Button kind="secondary" icon="GitPullRequest" iconRight="ChevronDown">
                {pr ? t("config.prItem", { number: pr.number, title: pr.title }) : t("config.prPlaceholder")}
              </Button>
            }
          />
        </div>

        <div style={s.stepRow}>
          <StepHeader n={2} active={!!pr}>
            {t("config.step2")}
          </StepHeader>
          {pr && (
            <button
              type="button"
              onClick={() => setExcluded(allOn ? new Set(enabled.map((a) => a.id)) : new Set())}
              style={s.selectAll}
            >
              {allOn ? t("config.clearAll") : t("config.selectAll")}
            </button>
          )}
        </div>
        {pr ? (
          <div role="group" aria-label={t("config.step2")} style={s.agentList}>
            {enabled.map((a) => {
              const e = estimateFor(estimatesQ.data?.estimates, a.id);
              const hasEstimate = e != null && (e.duration_ms != null || e.cost_usd != null);
              return (
                <AgentPickCard
                  key={a.id}
                  name={a.name}
                  description={a.description}
                  color={agentColor(a.id)}
                  on={!excluded.has(a.id)}
                  estimate={
                    hasEstimate ? `${formatSeconds(e.duration_ms)} · ${formatCost(e.cost_usd, 2)}` : "—"
                  }
                  onToggle={() => toggle(a.id)}
                />
              );
            })}
          </div>
        ) : (
          <div style={s.emptyBox}>
            <div style={s.emptyIcon}>
              <Icon.GitPullRequest size={21} style={s.emptyIconGlyph} />
            </div>
            <div style={s.emptyTitle}>{t("config.emptyPrTitle")}</div>
            <p style={s.emptyBody}>{t("config.emptyPrBody")}</p>
          </div>
        )}

        <div style={s.runBar}>
          <Button
            kind="primary"
            icon="Users"
            disabled={!pr || selected.length === 0}
            loading={create.isPending}
            onClick={run}
          >
            {create.isPending ? t("config.starting") : runLabel}
          </Button>
          {pr && selected.length > 0 && (
            <span className="mono" style={s.estimate}>
              {t("config.estimate", {
                time: formatSeconds(totals.durationMs),
                cost: formatCost(totals.costUsd, 2),
              })}
            </span>
          )}
        </div>
        {pr && selected.length > 0 && totals.excludedCount > 0 && (
          <div style={s.note}>{t("config.estimateExcluded", { count: totals.excludedCount })}</div>
        )}
        {create.isError && (
          <div role="alert" style={s.error}>
            {t("config.createFailed")}
          </div>
        )}
        {repoId && <PreviousRuns repoId={repoId} />}
      </div>
    </AppShell>
  );
}
