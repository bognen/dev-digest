/* ConfigureStep — design step 3: trigger chips, "Post results as" radios, block-merge info box.
   Spec additions (same visual language): Actions secrets rows and the check-name note. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Chip, FormField, Icon } from "@devdigest/ui";
import type { CiPostAs, CiTrigger } from "@devdigest/shared";
import { POST_OPTIONS, TRIGGERS } from "../../constants";
import type { ExportWizardApi } from "../../useExportWizard";
import { renderTemplate } from "../../renderTemplate";
import { s } from "../../styles";

function SecretStatus({ w }: { w: ExportWizardApi }) {
  const t = useTranslations("ci.exportWizard");
  // AC-68: when the secret names cannot be listed, fall back to the static "required".
  const status = w.secrets?.openrouter_api_key ?? "required";
  const tone = status === "set" ? "ok" : status === "not_set" ? "warn" : "neutral";
  return (
    <Badge
      color={tone === "neutral" ? "var(--text-muted)" : `var(--${tone})`}
      bg={tone === "neutral" ? undefined : `var(--${tone}-bg)`}
    >
      {status === "set" ? t("secrets.set") : status === "not_set" ? t("secrets.notSet") : t("secrets.required")}
    </Badge>
  );
}

export function ConfigureStep({ w }: { w: ExportWizardApi }) {
  const t = useTranslations("ci.exportWizard");
  const { state } = w;
  const toggle = (trigger: CiTrigger) =>
    w.actions.changeConfig({
      triggers: state.triggers.includes(trigger)
        ? state.triggers.filter((x) => x !== trigger)
        : [...state.triggers, trigger],
    });
  const strong = (text: string) => <span style={s.strong}>{text}</span>;
  const secretMissing = w.secrets?.openrouter_api_key !== "set";

  return (
    <div style={s.narrow}>
      <FormField label={t("triggerLabel")}>
        <div style={s.chips}>
          {TRIGGERS.map((trigger) => {
            const active = state.triggers.includes(trigger);
            return (
              <Chip key={trigger} active={active} icon={active ? "Check" : undefined} onClick={() => toggle(trigger)}>
                {t(`triggers.${trigger}`)}
              </Chip>
            );
          })}
        </div>
      </FormField>

      <FormField label={t("postResultsLabel")}>
        <div role="radiogroup" aria-label={t("postResultsLabel")} style={s.radios}>
          {POST_OPTIONS.map((o) => {
            const on = state.postAs === o.value;
            return (
              <label key={o.value} style={s.radioLabel}>
                <input
                  type="radio"
                  name="ci-post-as"
                  value={o.value}
                  checked={on}
                  onChange={() => w.actions.changeConfig({ postAs: o.value as CiPostAs })}
                  style={s.srOnly}
                />
                <span style={s.radioOuter(on)}>{on && <span style={s.radioDot} />}</span>
                {t(`postAs.${o.labelKey}`)}
                {o.recommended && (
                  <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                    {t("recommended")}
                  </Badge>
                )}
              </label>
            );
          })}
        </div>
      </FormField>

      <FormField label={t("secrets.title")}>
        <div style={s.secretRow}>
          <span className="mono">{t("secrets.openrouter")}</span>
          <SecretStatus w={w} />
        </div>
        <div style={s.secretRow}>
          <span className="mono">{t("secrets.githubToken")}</span>
          <Badge color="var(--text-muted)">{t("secrets.provided")}</Badge>
        </div>
        {secretMissing && (
          <div style={s.muted12}>
            {renderTemplate(t.raw("secretNote"), { key: <span className="mono">{t("secrets.openrouter")}</span> })} {t("secretNoteAc23")}
          </div>
        )}
      </FormField>

      <div style={s.infoBox}>
        <Icon.Info size={15} style={s.infoIcon} />
        <div style={s.infoText}>
          {renderTemplate(t.raw("blockMergeNote"), {
            failOn: strong(t("failOn")),
            requiredCheck: strong(t("requiredCheck")),
          })}
        </div>
      </div>
      {state.preview && (
        <div style={s.muted12}>
          {renderTemplate(t.raw("checkNote"), { checkName: <span className="mono">{state.preview.check_name}</span> })}
        </div>
      )}
    </div>
  );
}
