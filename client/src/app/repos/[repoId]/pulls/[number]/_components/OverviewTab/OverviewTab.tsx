"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { PrFile } from "@devdigest/shared";
import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { IntentCard } from "./_components/IntentCard";
import { LatestReviewBanner } from "./_components/LatestReviewBanner";
import { selectLatestReview, isNewestRunFailed, countBlockers } from "./helpers";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PrBriefCard } from "../PrBriefCard";
import { useStackedLayout } from "./useStackedLayout";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoFullName?: string | null;
  headSha?: string | null;
  /** The PR's changed files — forwarded to the brief for reference resolution. */
  files?: readonly PrFile[];
  /** Review-focus click → switch to the Files tab and open/scroll that file
   *  (and line, when one survived) — plans/11-why-risk-brief.md §7 (Q7). */
  onFocusFile?: (file: string, line: number | null) => void;
  /** Agent runs that exist for this PR (drives the brief's "Review not run yet" note). */
  reviewRunCount?: number;
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
}

export function OverviewTab({
  prId,
  prBody,
  repoFullName,
  headSha,
  files,
  onFocusFile,
  reviewRunCount,
  onRunStart,
  onRunsStarted,
}: OverviewTabProps) {
  // Same query keys as the page's own hooks → shared cache, no extra requests
  // or polling; refresh rides the page's existing invalidations (AC-20).
  const { data: reviews } = usePrReviews(prId);
  const { data: prRuns } = usePrRuns(prId);
  const latest = selectLatestReview(reviews ?? []);
  const t = useTranslations("brief");
  const stacked = useStackedLayout();

  return (
    <>
      {/* The single "PR Brief" label (AC-1); PrBriefCard no longer renders one. */}
      <SectionLabel icon="FileText">{t("section.title")}</SectionLabel>

      <LatestReviewBanner
        review={latest}
        newestRunFailed={isNewestRunFailed(prRuns)}
        findingsCount={latest?.findings.length ?? 0}
        blockers={latest ? countBlockers(latest.findings) : 0}
      />

      {/* Order: banner, brief panel, Intent/Blast grid (Risk areas slotted into
          the Intent cell), Review focus. One PrBriefCard instance, so the
          render prop keeps IntentCard/BlastRadiusCard mounted across brief
          status changes. */}
      <PrBriefCard
        prId={prId}
        repoFullName={repoFullName}
        files={files}
        reviewRunCount={reviewRunCount}
        onFocusFile={onFocusFile}
        onRunStart={onRunStart}
        onRunsStarted={onRunsStarted}
      >
        {({ panel, riskAreas, reviewFocus }) => (
          <>
            <div style={s.briefSection}>{panel}</div>

            <div style={stacked ? s.overviewGridStacked : s.overviewGrid}>
              <div style={s.overviewGridCell}>
                <IntentCard prId={prId} riskAreas={riskAreas} />
              </div>
              <div style={s.overviewGridCell}>
                <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
              </div>
            </div>

            {reviewFocus}
          </>
        )}
      </PrBriefCard>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
