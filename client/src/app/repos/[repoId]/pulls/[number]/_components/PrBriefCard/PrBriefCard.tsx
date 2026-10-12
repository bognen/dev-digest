/* PrBriefCard — specs/11-why-risk-brief.md, SPEC-05. Compact panel: a risk
   badge on the left; the brief's summary on the right; a refresh action
   top-right; and a footer with the review state + the Run Review dropdown.
   Risk areas and review focus (AC-36/D2) are visible by default whenever a
   brief is displayed and not generating. They are handed to an optional
   render-prop `children` as separate parts so OverviewTab can place them
   (risk areas inside the Intent card, review focus below the grid); without
   `children` the panel, risk areas and review focus render in sequence. The
   single return site keeps the caller's subtree from remounting when the
   status changes. Generation is explicit-action only (D13/N5) — nothing here
   auto-generates on mount, poll, or any other implicit trigger. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Skeleton } from "@devdigest/ui";
import type { PrFile } from "@devdigest/shared";
import { useBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { formatCost, relativeTime } from "@/lib/format";
import { RunReviewDropdown } from "../RunReviewDropdown";
import { RiskAreasSection } from "./RiskAreasSection";
import { ReviewFocusCard } from "./ReviewFocusCard";
import { GeneratingSkeleton } from "./_components/GeneratingSkeleton";
import { BriefBody } from "./_components/BriefBody";
import { useBriefNavigation } from "./useBriefNavigation";
import { STATUS_META, SEVERITY_COLOR, SEVERITY_ICON, SEVERITY_BG } from "./constants";
import { s } from "./styles";

export function PrBriefCard({
  prId,
  repoFullName,
  reviewRunCount = 0,
  files,
  onFocusFile,
  onRunStart,
  onRunsStarted,
  children,
}: {
  prId: string | null;
  repoFullName?: string | null;
  /** How many agent runs exist for this PR — drives the "Review not run yet" note. */
  reviewRunCount?: number;
  /** The PR's changed files — brief references are resolved against these. */
  files?: readonly PrFile[];
  onFocusFile?: (file: string, line: number | null) => void;
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Render prop: lets the caller place the panel, risk areas and review focus. */
  children?: (parts: {
    panel: React.ReactNode;
    riskAreas: React.ReactNode | null;
    reviewFocus: React.ReactNode | null;
  }) => React.ReactNode;
}) {
  const t = useTranslations("brief");
  const toast = useToast();
  const { data: page, isLoading } = useBrief(prId);
  const generate = useGenerateBrief(prId);
  const nav = useBriefNavigation(files, onFocusFile);
  const onNavigate = nav.canNavigate ? nav.navigate : undefined;

  const generating = generate.isPending || page?.status === "generating";
  const hasBrief = !!page?.brief;
  const mutationFailed = generate.isError && !generating;

  function onGenerate(regenerate: boolean) {
    generate.mutate(
      { regenerate },
      {
        onError: (e) => {
          toast.error(e instanceof ApiError && e.message ? e.message : t("generate.error"));
        },
      },
    );
  }

  function finish(panel: React.ReactNode, riskAreas: React.ReactNode | null, reviewFocus: React.ReactNode | null) {
    return children ? children({ panel, riskAreas, reviewFocus }) : (
      <>
        {panel}
        {riskAreas}
        {reviewFocus}
      </>
    );
  }

  if (isLoading || !page) {
    return finish(
      <div style={s.panel}>
        <div style={s.loadingStack}>
          <Skeleton height={20} width={240} />
          <Skeleton height={44} />
        </div>
      </div>,
      null,
      null,
    );
  }

  const meta = STATUS_META[page.status];
  const StatusIcon = Icon[meta.icon];
  // One short status line in the footer; a healthy, up-to-date brief shows its
  // provenance instead of a "Brief up to date" banner.
  const statusText =
    page.status === "possibly_stale"
      ? t("status.possibly_stale", { markers: page.stale_markers.join(", ") || t("status.generated") })
      : page.reason
        ? `${t(`status.${page.status}`)} — ${page.reason}`
        : t(`status.${page.status}`);
  const provenanceText = page.provenance
    ? t("provenance.generatedBy", {
        when: relativeTime(page.provenance.generated_at),
        model: page.provenance.model,
        cost: formatCost(page.provenance.cost_usd),
      })
    : null;
  const failedMeta = STATUS_META.failed;
  const FailedIcon = Icon[failedMeta.icon];
  const footerNote = generating ? null : mutationFailed ? (
    <span style={s.footerNote} role="status" aria-live="polite">
      <FailedIcon size={13} style={{ color: failedMeta.color, flexShrink: 0 }} />
      {t("status.failed")}
    </span>
  ) : (
    page.status === "generated" && hasBrief ? (
      <span style={s.footerNote}>{provenanceText}</span>
    ) : page.status !== "none" ? (
      <span style={s.footerNote} role="status" aria-live="polite">
        <StatusIcon size={13} style={{ color: meta.color, flexShrink: 0 }} />
        {statusText}
      </span>
    ) : null
  );

  const brief = page.brief;

  const panel = (
    <div style={s.panel}>
      {generating ? (
        <div style={s.body}>
          <GeneratingSkeleton />
        </div>
      ) : hasBrief && brief ? (
        <>
          <div style={s.badgeCol}>
            <Badge
              color={SEVERITY_COLOR[brief.risk_level]}
              bg={SEVERITY_BG[brief.risk_level]}
              icon={SEVERITY_ICON[brief.risk_level]}
            >
              {t(`risk.badge.${brief.risk_level}`)}
            </Badge>
          </div>
          <div style={s.body}>
            <BriefBody brief={brief} />
          </div>
          <button
            type="button"
            style={s.refresh}
            aria-label={generating ? t("generate.generating") : t("generate.regenerate")}
            title={generating ? t("generate.generating") : t("generate.regenerate")}
            disabled={generating || !prId}
            onClick={() => onGenerate(true)}
          >
            <Icon.RefreshCw size={14} />
          </button>
        </>
      ) : (
        <div style={s.body}>
          <div style={s.title}>{t("section.emptyTitle")}</div>
          <div style={s.description}>{t("section.emptyBody")}</div>
        </div>
      )}

      <div style={s.footer}>
        <div style={s.footerLeft}>{footerNote}</div>
        <div style={s.footerRight}>
          {!hasBrief && (
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={generating}
              disabled={generating || !prId}
              onClick={() => onGenerate(false)}
            >
              {generating ? t("generate.generating") : t("generate.generate")}
            </Button>
          )}
          {reviewRunCount === 0 && <span style={s.footerNote}>{t("reviewNotRun")}</span>}
          {prId && <RunReviewDropdown prId={prId} onRunStart={onRunStart} onRunsStarted={onRunsStarted} />}
        </div>
      </div>
    </div>
  );

  const showParts = hasBrief && brief && !generating;
  const headSha = page.provenance?.head_sha;
  return finish(
    panel,
    showParts ? (
      <RiskAreasSection
        risks={brief.risks}
        repoFullName={repoFullName}
        headSha={headSha}
        onNavigate={onNavigate}
        notInDiffKey={nav.notInDiffKey}
      />
    ) : null,
    showParts ? (
      <ReviewFocusCard
        items={brief.review_focus}
        repoFullName={repoFullName}
        headSha={headSha}
        onNavigate={onNavigate}
        notInDiffKey={nav.notInDiffKey}
      />
    ) : null,
  );
}
