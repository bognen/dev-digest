/* PrBriefCard — specs/11-why-risk-brief.md. Compact panel ABOVE the
   Intent/Blast-Radius grid: a risk badge on the left; the brief's WHAT (bold
   title) and WHY (muted description) on the right; a refresh action top-right;
   and a footer with the review state + the Run Review dropdown. Risk areas and
   review focus (AC-36/D2) sit behind a "Show details" toggle so the default
   view stays the size of the design mockup. Generation is explicit-action only
   (D13/N5) — nothing here auto-generates on mount, poll, or any other
   implicit trigger. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { useBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { formatCost, relativeTime } from "@/lib/format";
import { RunReviewDropdown } from "../RunReviewDropdown";
import { RiskArea } from "./RiskArea";
import { ReviewFocusList } from "./ReviewFocusList";
import { STATUS_META, SEVERITY_COLOR, SEVERITY_ICON, SEVERITY_BG } from "./constants";
import { s } from "./styles";

export function PrBriefCard({
  prId,
  repoFullName,
  reviewRunCount = 0,
  onFocusFile,
  onRunStart,
  onRunsStarted,
}: {
  prId: string | null;
  repoFullName?: string | null;
  /** How many agent runs exist for this PR — drives the "Review not run yet" note. */
  reviewRunCount?: number;
  onFocusFile?: (file: string, line: number | null) => void;
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
}) {
  const t = useTranslations("brief");
  const toast = useToast();
  const { data: page, isLoading } = useBrief(prId);
  const generate = useGenerateBrief(prId);
  const [showDetails, setShowDetails] = React.useState(false);

  const generating = generate.isPending || page?.status === "generating";
  const hasBrief = !!page?.brief;

  function onGenerate(regenerate: boolean) {
    generate.mutate(
      { regenerate },
      {
        onError: (e) => {
          toast.error(e instanceof ApiError ? e.message : "Couldn't generate the brief.");
        },
      },
    );
  }

  const label = <SectionLabel icon="FileText">{t("section.title")}</SectionLabel>;

  if (isLoading || !page) {
    return (
      <section>
        {label}
        <div style={s.panel}>
          <div style={s.loadingStack}>
            <Skeleton height={20} width={240} />
            <Skeleton height={44} />
          </div>
        </div>
      </section>
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
  const footerNote =
    page.status === "generated" && hasBrief ? (
      <span style={s.footerNote}>{provenanceText}</span>
    ) : page.status !== "none" ? (
      <span style={s.footerNote} role="status" aria-live="polite">
        <StatusIcon size={13} style={{ color: meta.color, flexShrink: 0 }} />
        {statusText}
      </span>
    ) : null;

  const brief = page.brief;

  return (
    <section>
      {label}
      <div style={s.panel}>
        {hasBrief && brief ? (
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
              <div style={s.title}>{brief.what}</div>
              <div style={s.description}>{brief.why}</div>
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
          <div style={s.footerLeft}>
            {footerNote}
            {hasBrief && (
              <button
                type="button"
                style={s.detailsToggle}
                aria-expanded={showDetails}
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? t("details.hide") : t("details.show")}
              </button>
            )}
          </div>
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

        {hasBrief && brief && showDetails && (
          <div style={s.details}>
            <div style={s.block}>
              <div style={s.blockLabel}>{t("section.risks")}</div>
              {brief.risks.length === 0 ? (
                <p style={s.prose}>{t("section.noRisks")}</p>
              ) : (
                <div style={s.riskList}>
                  {brief.risks.map((risk, i) => (
                    <RiskArea
                      key={`${risk.kind}-${i}`}
                      risk={risk}
                      repoFullName={repoFullName}
                      headSha={page.provenance?.head_sha}
                    />
                  ))}
                </div>
              )}
            </div>
            <div style={s.block}>
              <div style={s.blockLabel}>{t("section.focus")}</div>
              <ReviewFocusList
                items={brief.review_focus}
                repoFullName={repoFullName}
                headSha={page.provenance?.head_sha}
                onFocusFile={onFocusFile}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
