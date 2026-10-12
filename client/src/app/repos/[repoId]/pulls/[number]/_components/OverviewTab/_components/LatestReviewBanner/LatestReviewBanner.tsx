/* LatestReviewBanner — thin presentational wrapper: shows the latest completed
   review's verdict + PR score at the top of Overview by reusing VerdictBanner.
   All data comes in via props (selected by OverviewTab/helpers). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import { VerdictBanner } from "../../../VerdictBanner";
import { s } from "./styles";

export interface LatestReviewBannerProps {
  /** Result of selectLatestReview(); null → render nothing. */
  review: ReviewRecord | null;
  /** True when the newest run failed (show notice beside the last completed review). */
  newestRunFailed: boolean;
  findingsCount: number;
  blockers: number;
}

export function LatestReviewBanner({
  review,
  newestRunFailed,
  findingsCount,
  blockers,
}: LatestReviewBannerProps) {
  const tBrief = useTranslations("brief");
  if (!review || review.verdict == null) return null;
  return (
    <section aria-label={tBrief("banner.regionLabel")} style={s.wrap}>
      {newestRunFailed && (
        <p role="status" style={s.notice}>
          {tBrief("banner.latestRunFailed")}
        </p>
      )}
      <VerdictBanner
        verdict={review.verdict}
        summary={review.summary}
        score={review.score}
        findingsCount={findingsCount}
        blockers={blockers}
        agentName={review.agent_name}
      />
    </section>
  );
}
