/* CiTab — agent "CI" tab (design `CITab`): empty state, or the deployed state with the
   "Fail CI on" card, installation rows and "Add repository"; opens the Export to CI wizard.
   Spec additions: remove-from-CI with confirmation, removal / removed notices, run history. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Icon, MonoLink, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Agent, CiInstallation, CiRemoveResult } from "@devdigest/shared";
import { CiRunsTable } from "@/components/ci-runs/CiRunsTable";
import { useCiOverview, useCiRemove, useRepos } from "@/lib/hooks";
import { ExportCiWizard } from "./_components/ExportCiWizard";
import { FailOnCard } from "./_components/FailOnCard";
import { InstallationRow } from "./_components/InstallationRow";
import { firstFreeRepoId, firstUpdatable, safeGithubUrl } from "./helpers";
import { s } from "./styles";

/** `repoId` undefined = let the wizard default to its first connected repo. */
interface WizardTarget {
  repoId?: string;
}

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci.ciTab");
  const tr = useTranslations("ci.runs");
  const overview = useCiOverview(agent.id);
  const repos = useRepos();
  const remove = useCiRemove();
  const [wizard, setWizard] = React.useState<WizardTarget | null>(null);
  const [removing, setRemoving] = React.useState<CiInstallation | null>(null);
  const [result, setResult] = React.useState<CiRemoveResult | null>(null);

  if (overview.isError) {
    return (
      <div style={s.wrap}>
        <ErrorState title={t("loadError")} onRetry={() => overview.refetch()} />
      </div>
    );
  }
  if (!overview.data) {
    return (
      <div style={{ ...s.wrap, ...s.loading }}>
        <Skeleton height={28} width={240} />
        <Skeleton height={60} />
        <Skeleton height={52} />
      </div>
    );
  }

  const { installations, active_repos, current_workflow_version, runs } = overview.data;
  const updatable = firstUpdatable(installations);
  const openAdd = () => setWizard({ repoId: firstFreeRepoId(repos.data, installations) });
  const confirmRemove = () => {
    if (!removing) return;
    remove.mutate(
      { agentId: agent.id, installationId: removing.id },
      {
        onSuccess: (r) => {
          setResult(r);
          setRemoving(null);
        },
      },
    );
  };
  const resultUrl = result ? safeGithubUrl(result.outcome === "removed_directly" ? result.install_pr_url : result.pr_url) : null;

  return (
    <div style={s.wrap}>
      {wizard && (
        <ExportCiWizard agentId={agent.id} agentName={agent.name} repoId={wizard.repoId} onClose={() => setWizard(null)} />
      )}
      {installations.length === 0 ? (
        <div style={s.empty}>
          <EmptyState icon="Workflow" title={t("emptyTitle")} body={t("emptyBody")} cta={t("emptyCta")} onCta={openAdd} />
        </div>
      ) : (
        <>
          <div style={s.header}>
            <h2 style={s.h2}>{t("heading")}</h2>
            {active_repos > 0 && (
              <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                {t("activeIn", { count: active_repos })}
              </Badge>
            )}
            <div style={s.headerActions}>
              {updatable && (
                <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => setWizard({ repoId: updatable.repo_id })}>
                  {t("updateConfig")}
                </Button>
              )}
              <Button kind="primary" size="sm" icon="Plus" onClick={openAdd}>
                {t("addToCi")}
              </Button>
            </div>
          </div>
          <FailOnCard agent={agent} />
          {result && (
            <div role="status" style={s.notice}>
              <Icon.Check size={15} style={s.noticeIcon} />
              <div>
                {result.outcome === "removed_directly"
                  ? t("removedDirectly")
                  : result.outcome === "removal_pr_reused"
                    ? t("removalPrReused")
                    : t("removalPrOpened")}
                {resultUrl && (
                  <>
                    {" "}
                    <MonoLink href={resultUrl}>{result.outcome === "removed_directly" ? t("viewInstallPr") : t("viewPr")}</MonoLink>
                  </>
                )}
              </div>
            </div>
          )}
          {installations.map((i) => (
            <InstallationRow
              key={i.id}
              installation={i}
              currentVersion={current_workflow_version}
              agentFailOn={agent.ci_fail_on}
              onRemove={setRemoving}
            />
          ))}
          <button type="button" onClick={openAdd} style={s.addRepo}>
            <Icon.Plus size={15} />
            {t("addRepository")}
          </button>
          {runs.length > 0 && (
            <div style={s.history}>
              <SectionLabel icon="History">{tr("title")}</SectionLabel>
              <CiRunsTable runs={runs} />
            </div>
          )}
        </>
      )}
      {removing && (
        <ConfirmDialog
          danger
          title={t("removeConfirmTitle", { agentName: agent.name, repo: removing.repo })}
          message={t("removeConfirmBody")}
          confirmLabel={remove.isPending ? t("removing") : t("removeConfirm")}
          cancelLabel={t("removeCancel")}
          loading={remove.isPending}
          onConfirm={confirmRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
