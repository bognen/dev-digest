/* RiskAreasSection — the RISK AREAS list (AC-37) as a labelled region. Rendered
   inside the Intent card (or a card of its own when there is no intent) by
   OverviewTab through PrBriefCard's render prop (SPEC-05 AC-5, AC-6, AC-9). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Risk } from "@devdigest/shared";
import { RiskArea } from "./RiskArea";
import { s } from "./styles";

export function RiskAreasSection({
  risks,
  repoFullName,
  headSha,
  onNavigate,
  notInDiffKey,
}: {
  risks: Risk[];
  repoFullName?: string | null;
  headSha?: string | null;
  onNavigate?: (key: string, file: string, line: number | null) => void;
  notInDiffKey?: string | null;
}) {
  const t = useTranslations("brief");
  const id = React.useId();

  return (
    <section aria-labelledby={id} style={s.riskSection}>
      <div id={id} style={s.blockLabel}>
        {t("section.risks")}
      </div>
      {risks.length === 0 ? (
        <p style={s.prose}>{t("section.noRisks")}</p>
      ) : (
        <div style={s.riskList}>
          {risks.map((risk, i) => (
            <RiskArea
              key={`${risk.kind}-${i}`}
              risk={risk}
              repoFullName={repoFullName}
              headSha={headSha}
              navKeyPrefix={`risk:${i}`}
              onNavigate={onNavigate}
              notInDiffKey={notInDiffKey}
            />
          ))}
        </div>
      )}
    </section>
  );
}
