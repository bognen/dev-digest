/* BriefBody — the text part of the PR Brief card (SPEC-04 AC-4/5/12/13).
   Shows the short `summary` when present, otherwise the legacy what/why pair,
   plus a "generated without" note for missing inputs. All model text is
   rendered as plain JSX text (NFR-4b) — never HTML or markdown. */
import React from "react";
import { useTranslations } from "next-intl";
import type { PrBrief } from "@devdigest/shared";
import { s } from "../../styles";

export function BriefBody({ brief }: { brief: PrBrief }) {
  const t = useTranslations("brief");
  const hasSummary = !!brief.summary?.trim();
  const missing = brief.missing_inputs ?? [];

  return (
    <>
      {hasSummary ? (
        <p style={s.summary} data-testid="brief-summary">
          {brief.summary}
        </p>
      ) : (
        <>
          <div style={s.title}>{brief.what}</div>
          <div style={s.description}>{brief.why}</div>
        </>
      )}
      {missing.length > 0 && (
        <p style={s.missingInputs} data-testid="brief-missing-inputs">
          {t("missingInputs.statement", {
            inputs: missing.map((k) => t(`missingInputs.input.${k}`)).join(", "),
          })}
        </p>
      )}
    </>
  );
}
