/* InstallStep — design step 4: "Open a PR" primary card, "Copy files as a zip" secondary card,
   help line. Success / error / branch-exists / runner-missing states use the notice style. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { ExportWizardApi } from "../../useExportWizard";
import { CI_DOCS_URL } from "../../constants";
import { installedPr } from "../../helpers";
import { ErrorNotice } from "../ErrorNotice";
import { renderTemplate } from "../../renderTemplate";
import { s } from "../../styles";

export interface InstallStepProps {
  w: ExportWizardApi;
  agentName: string;
}

export function InstallStep({ w, agentName }: InstallStepProps) {
  const t = useTranslations("ci.exportWizard");
  const { state, install, zip, lint } = w;
  const pr = installedPr(install.result);
  const preview = state.preview;
  const title = t("installPrTitle", { agentName });

  return (
    <div style={s.narrow}>
      {pr && (
        <div role="status" style={s.notice("ok")}>
          <Icon.Check size={15} style={s.infoIcon} />
          <div>
            {pr.reused ? t("installDoneReused") : t("installDone")}
            {pr.url && (
              <>
                {" "}
                <a href={pr.url} target="_blank" rel="noopener noreferrer" style={s.helpLink}>
                  {t("viewPr")}
                </a>
              </>
            )}
          </div>
        </div>
      )}
      {lint?.error && (
        <div role="alert" style={s.notice("crit")}>
          <Icon.AlertTriangle size={15} style={s.infoIcon} />
          <div>{lint.error.line != null ? t("yamlError", { line: lint.error.line }) : t("yamlErrorGeneric")}</div>
        </div>
      )}
      {install.error && <ErrorNotice error={install.error} operation="install" onUseBranch={install.run} />}
      {zip.error && <ErrorNotice error={zip.error} operation="zip" />}

      <button type="button" onClick={() => install.run()} disabled={install.pending || !!pr} style={s.primaryCard}>
        <div style={s.primaryTitleRow}>
          <Icon.GitPullRequest size={18} style={{ color: "var(--accent)" }} />
          <span style={s.primaryTitle}>{t("installCardTitle")}</span>
          <Badge color="var(--accent-text)" bg="var(--bg-elevated)" style={s.pushRight}>
            {t("recommended")}
          </Badge>
        </div>
        <p style={s.primaryBody}>
          {renderTemplate(t.raw("installCardBody"), {
            repo: <span className="mono">{preview?.repo_full_name}</span>,
            title,
            count: preview?.files.length ?? 0,
          })}
        </p>
      </button>
      <button type="button" onClick={zip.run} disabled={zip.pending} style={s.secondaryCard}>
        <div style={s.row10}>
          <Icon.Copy size={16} style={{ color: "var(--text-secondary)" }} />
          <span style={s.secondaryTitle}>{zip.pending ? t("zipDownloading") : t("zipTitle")}</span>
          <span style={s.secondaryHint}>{t("zipHint")}</span>
        </div>
      </button>
      <p style={s.help}>
        {renderTemplate(t.raw("help"), {
          link: (
            <a href={CI_DOCS_URL} target="_blank" rel="noopener noreferrer" style={s.helpLink}>
              {t("helpLink")}
            </a>
          ),
        })}
      </p>
    </div>
  );
}
