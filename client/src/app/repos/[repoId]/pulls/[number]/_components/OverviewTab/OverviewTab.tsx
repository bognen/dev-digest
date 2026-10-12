"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { PrFile } from "@devdigest/shared";
import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { IntentCard } from "./_components/IntentCard";
import { LatestReviewBanner } from "./_components/LatestReviewBanner";
import { selectLatestReview, isNewestRunFailed, countBlockers } from "./helpers";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PrBriefCard } from "../PrBriefCard";
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

  return (
    <>
      <LatestReviewBanner
        review={latest}
        newestRunFailed={isNewestRunFailed(prRuns)}
        findingsCount={latest?.findings.length ?? 0}
        blockers={latest ? countBlockers(latest.findings) : 0}
      />

      {/* specs/11-why-risk-brief.md Q8 — full-width, ABOVE the Intent/Blast
          grid, matching the design mockup's placement. No label is added to
          the verdict/score block within it (D1). */}
      <div style={s.briefSection}>
        <PrBriefCard
          prId={prId}
          repoFullName={repoFullName}
          files={files}
          reviewRunCount={reviewRunCount}
          onFocusFile={onFocusFile}
          onRunStart={onRunStart}
          onRunsStarted={onRunsStarted}
        />
      </div>

      <div style={s.overviewGrid}>
        <div style={s.overviewGridCell}>
          <IntentCard prId={prId} />
        </div>
        <div style={s.overviewGridCell}>
          <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
