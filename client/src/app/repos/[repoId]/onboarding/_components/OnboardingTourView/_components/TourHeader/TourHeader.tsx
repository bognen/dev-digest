"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingTour, OnboardingTourProvenance, OnboardingTourState } from "@devdigest/shared";
import { relativeTime } from "@/lib/format";
import { TourStatusBadge } from "../TourStatusBadge";
import { s } from "./styles";

interface TourHeaderProps {
  repoName: string;
  provenance: OnboardingTourProvenance | null;
  basis: OnboardingTour["basis"] | null;
  lastFailure: OnboardingTourState["last_failure"];
  generating: boolean;
  onRegenerate: () => void;
}

/** Title, provenance line, basis, status and Regenerate. No Regenerate while generating (AC-33). No Share link. */
export function TourHeader({
  repoName,
  provenance,
  basis,
  lastFailure,
  generating,
  onRegenerate,
}: TourHeaderProps) {
  const t = useTranslations("onboarding");
  const age = provenance ? relativeTime(provenance.generated_at) : null;

  return (
    <header style={s.header}>
      <div style={s.row}>
        <h1 style={s.heading}>
          {t("headingPrefix")}
          <span className="mono" style={s.repoName}>
            {repoName}
          </span>
        </h1>
        {!generating && provenance && (
          <Button icon="RefreshCw" onClick={onRegenerate}>
            {t("regenerate")}
          </Button>
        )}
      </div>
      {provenance && (
        <p style={s.meta}>
          {t("header.generatedFrom", { count: provenance.files_indexed })}
          {age === "now" && ` · ${t("header.refreshedNow")}`}
          {age !== null && age !== "now" && age !== "—" && ` · ${t("header.refreshed", { time: age })}`}
        </p>
      )}
      {basis && (
        <p style={s.meta}>
          {t("header.basis", { considered: basis.files_considered, indexed: basis.files_indexed })}
        </p>
      )}
      {provenance && (
        <div style={s.status}>
          <TourStatusBadge provenance={provenance} />
        </div>
      )}
      {lastFailure && (
        <div style={s.failure} role="status">
          {t("header.lastFailure", { reason: lastFailure.reason })}
        </div>
      )}
    </header>
  );
}
