/* ExportCiWizard — "Export to CI" modal (N12): Target, Preview, Configure, Install.
   Layout, copy and tokens follow the design; state lives in `useExportWizard`. */
"use client";

import React, { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button, ConfirmDialog, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { Repo } from "@devdigest/shared";
import { useRepos } from "@/lib/hooks";
import { STEP_CONFIGURE, STEP_INSTALL, STEP_KEYS, STEP_PREVIEW, STEP_TARGET } from "./constants";
import { canInstall } from "./helpers";
import { useExportWizard } from "./useExportWizard";
import { useModalFocus } from "./useModalFocus";
import { TargetStep } from "./_components/TargetStep";
import { PreviewStep } from "./_components/PreviewStep";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";
import { s } from "./styles";

export interface ExportCiWizardProps {
  agentId: string;
  agentName: string;
  /** Preselected repository; defaults to the first connected repo. */
  repoId?: string;
  onClose: () => void;
}

export function ExportCiWizard(props: ExportCiWizardProps) {
  const t = useTranslations("ci.exportWizard");
  const tc = useTranslations("common");
  const repos = useRepos();
  if (!repos.data) {
    return (
      <Modal
        title={t("title")}
        subtitle={t("subtitle", { agentName: props.agentName || t("thisAgent") })}
        onClose={props.onClose}
      >
        <div style={s.body}>{repos.isError ? t("genericError") : tc("states.loading")}</div>
      </Modal>
    );
  }
  return <WizardModal {...props} repos={repos.data} />;
}

function WizardModal({ agentId, agentName, repoId, repos, onClose }: ExportCiWizardProps & { repos: Repo[] }) {
  const t = useTranslations("ci.exportWizard");
  const tc = useTranslations("common");
  const w = useExportWizard(agentId, repoId ?? repos[0]?.id ?? "");
  const { state } = w;
  const root = useRef<HTMLDivElement>(null);
  // Escape dismisses the regenerate confirmation first, then the wizard.
  useModalFocus(root, state.pending ? w.actions.declineRegenerate : onClose);

  const labels = STEP_KEYS.map((k) => t(`steps.${k}`));
  const done = !!w.install.result;
  const installable = canInstall({ lint: w.lint, hasPreview: !!state.preview, busy: w.install.pending });

  return (
    <div ref={root} style={{ display: "contents" }}>
      <Modal
        width={720}
        title={t("title")}
        subtitle={t("subtitle", { agentName: agentName || t("thisAgent") })}
        onClose={onClose}
        footer={
          <div style={s.footer}>
            {state.step > STEP_TARGET && !done && (
              <Button kind="ghost" icon="ChevronLeft" onClick={w.actions.back}>
                {t("back")}
              </Button>
            )}
            <div style={s.footerRight}>
              {done ? (
                <Button kind="primary" onClick={onClose}>
                  {tc("actions.close")}
                </Button>
              ) : state.step < STEP_INSTALL ? (
                <Button
                  kind="primary"
                  iconRight="ArrowRight"
                  disabled={!w.canContinue[state.step]}
                  onClick={w.actions.next}
                >
                  {t("continue")}
                </Button>
              ) : (
                <Button
                  kind="primary"
                  icon="Check"
                  disabled={!installable}
                  loading={w.install.pending}
                  onClick={() => w.install.run()}
                >
                  {w.install.pending ? t("installing") : t("install")}
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div style={s.stepperBand}>
          <ExportWizardSteps step={state.step} labels={labels} />
        </div>
        <div style={s.body}>
          {state.step === STEP_TARGET && (
            <TargetStep repos={repos} repoId={state.repoId} onRepo={w.actions.setRepo} />
          )}
          {state.step === STEP_PREVIEW && <PreviewStep w={w} />}
          {state.step === STEP_CONFIGURE && <ConfigureStep w={w} />}
          {state.step === STEP_INSTALL && <InstallStep w={w} agentName={agentName || t("thisAgent")} />}
        </div>
      </Modal>
      {state.pending && (
        <ConfirmDialog
          title={t("regenerateTitle")}
          message={t("regenerateBody")}
          confirmLabel={t("regenerateConfirm")}
          cancelLabel={t("regenerateCancel")}
          loading={w.preview.pending}
          onConfirm={w.actions.confirmRegenerate}
          onCancel={w.actions.declineRegenerate}
        />
      )}
    </div>
  );
}
