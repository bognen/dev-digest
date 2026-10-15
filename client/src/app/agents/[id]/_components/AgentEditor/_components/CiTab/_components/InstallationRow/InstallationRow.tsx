/* InstallationRow — one repo installation (design row: icon, mono repo, Actions badge,
   status badge, time) plus the spec additions: workflow version / outdated marker,
   removal-pending PR link, read-only removed state and "Remove from CI". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, MonoLink } from "@devdigest/ui";
import type { CiFailOn, CiInstallation } from "@devdigest/shared";
import { CI_STATUS_STYLE } from "@/components/ci-runs/CiRunsTable";
import { canRemove, isOutdated, rowStatus, safeGithubUrl, timeAgo } from "../../helpers";
import { s } from "../../styles";

export interface InstallationRowProps {
  installation: CiInstallation;
  currentVersion: number;
  agentFailOn: CiFailOn;
  onRemove: (installation: CiInstallation) => void;
}

export function InstallationRow({ installation: i, currentVersion, agentFailOn, onRemove }: InstallationRowProps) {
  const t = useTranslations("ci");
  const status = rowStatus(i);
  const removed = i.status === "removed";
  const outdated = isOutdated(i, currentVersion);
  const policyChanged = i.status === "active" && i.exported_ci_fail_on !== agentFailOn;
  const prUrl = safeGithubUrl(i.status === "removal_pending" ? i.removal_pr_url : i.pr_url);
  const showPr = !!prUrl && (i.status === "removal_pending" || (i.status === "active" && i.pr_state !== "merged"));

  const badge =
    status.kind === "run"
      ? { c: CI_STATUS_STYLE[status.status].c, bg: CI_STATUS_STYLE[status.status].bg, text: t(`runs.status.${CI_STATUS_STYLE[status.status].label}`) }
      : status.key === "active"
        ? { c: "var(--ok)", bg: "var(--ok-bg)", text: t("ciTab.status.active") }
        : status.key === "removalPending"
          ? { c: "var(--warn)", bg: "var(--warn-bg)", text: t("ciTab.status.removalPending") }
          : { c: "var(--text-muted)", bg: "var(--bg-hover)", text: t("ciTab.status.removed") };

  return (
    <div style={s.row(removed)}>
      <Icon.GitBranch size={16} style={s.rowIcon} />
      <div style={s.repoCol}>
        <span className="mono" style={s.repo}>
          {i.repo}
        </span>
        <div style={s.details}>
          <span className="mono" style={s.mono}>
            {t("ciTab.version", { version: i.workflow_version })}
          </span>
          {outdated && (
            <Badge color="var(--warn)" bg="var(--warn-bg)">
              {t("ciTab.outdated", { installed: i.workflow_version, current: currentVersion })}
            </Badge>
          )}
          {policyChanged && <span>{t("ciTab.policyChanged")}</span>}
          {showPr && prUrl && <MonoLink href={prUrl}>{i.status === "removal_pending" ? t("ciTab.viewPr") : t("ciTab.viewInstallPr")}</MonoLink>}
        </div>
      </div>
      <Badge color="var(--text-secondary)" icon="Workflow">
        {t("runs.source.githubActions")}
      </Badge>
      <Badge color={badge.c} bg={badge.bg} dot>
        {badge.text}
      </Badge>
      <span style={s.time}>{i.latest_run ? timeAgo(i.latest_run.ran_at) : t("ciTab.noRunsYet")}</span>
      {canRemove(i) && (
        <Button kind="ghost" size="sm" icon="Trash" onClick={() => onRemove(i)}>
          {t("ciTab.remove")}
        </Button>
      )}
    </div>
  );
}
