/* TargetStep — design step 1. Only GitHub Actions exists (no CircleCI / Jenkins / CLI generators),
   so the design's card grid shows one card; the repository comes from the connected repos. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, FormField, Icon, SelectInput } from "@devdigest/ui";
import type { Repo } from "@devdigest/shared";
import { s } from "../../styles";

export interface TargetStepProps {
  repos: Repo[];
  repoId: string;
  onRepo: (repoId: string) => void;
}

export function TargetStep({ repos, repoId, onRepo }: TargetStepProps) {
  const t = useTranslations("ci.exportWizard");
  const options = [
    ...(repoId ? [] : [{ value: "", label: repos.length ? t("repoPicker.placeholder") : t("repoPicker.empty") }]),
    ...repos.map((r) => ({ value: r.id, label: r.full_name })),
  ];
  return (
    <div>
      <div style={s.targetGrid}>
        <button type="button" aria-pressed="true" style={s.targetCard(true)}>
          <div style={s.row10}>
            <div style={s.targetIcon(true)}>
              <Icon.Workflow size={18} />
            </div>
            <span style={s.targetName}>{t("targets.gha")}</span>
            <Badge color="var(--accent-text)" bg="var(--accent-bg)" style={s.pushRight}>
              {t("recommended")}
            </Badge>
          </div>
          <p style={s.targetDesc}>{t("targets.ghaDesc")}</p>
        </button>
      </div>
      <div style={s.repoField}>
        <FormField label={t("repoPicker.label")}>
          <SelectInput value={repoId} onChange={onRepo} options={options} />
        </FormField>
      </div>
    </div>
  );
}
