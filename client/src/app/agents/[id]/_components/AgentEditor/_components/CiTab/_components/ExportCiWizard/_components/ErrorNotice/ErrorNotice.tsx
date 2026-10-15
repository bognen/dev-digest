/* ErrorNotice — inline failure box for preview / install / zip (AC-58, AC-89, runner missing).
   Plain text only; nothing from the server is rendered as HTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { WizardError } from "../../helpers";
import { renderTemplate } from "../../renderTemplate";
import { s } from "../../styles";

export interface ErrorNoticeProps {
  error: WizardError;
  /** `ci.exportWizard.operations.<key>` naming what failed. */
  operation: "preview" | "install" | "zip";
  /** Offered for `ci_branch_exists`: retry on the suggested branch. */
  onUseBranch?: (branch: string) => void;
  onRetry?: () => void;
}

export function ErrorNotice({ error, operation, onUseBranch, onRetry }: ErrorNoticeProps) {
  const t = useTranslations("ci.exportWizard");
  const warn = error.kind === "branch_exists";
  return (
    <div role="alert" style={s.notice(warn ? "warn" : "crit")}>
      <Icon.AlertTriangle size={15} style={s.infoIcon} />
      <div>
        {error.kind === "branch_exists" && (
          <>
            <div>
              {renderTemplate(t.raw("branchExists"), { branch: <span className="mono">{error.branch}</span> })}
            </div>
            {onUseBranch && (
              <div style={s.noticeAction}>
                <Button size="sm" kind="secondary" onClick={() => onUseBranch(error.suggested)}>
                  {t("branchExistsAlt", { alternative: error.suggested })}
                </Button>
              </div>
            )}
          </>
        )}
        {error.kind === "runner_missing" && (
          <>{renderTemplate(t.raw("runnerMissing"), { command: <span className="mono">{error.command}</span> })}</>
        )}
        {error.kind === "github" && t("githubError", { operation: t(`operations.${operation}`), status: error.status })}
        {error.kind === "generic" && t("genericError")}
        {onRetry && error.kind !== "branch_exists" && (
          <div style={s.noticeAction}>
            <Button size="sm" kind="secondary" onClick={onRetry}>
              {t("regenerate")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
