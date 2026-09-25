/* IntentCard — the derived-intent section of the Overview tab. Renders a
   one-sentence statement plus in/out-of-scope columns; low-confidence intents
   get a visible badge, dashed border, "why" line, and an action hint. Every
   LLM-derived field (statement, bullets, ticket refs) is rendered as PLAIN
   TEXT ONLY — never markdown/HTML, never a link. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Chip, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrIntent, useRegenerateIntent } from "@/lib/hooks/intent";
import { captionFor, joinWithAnd, SOURCE_I18N_KEY, whyLineInfo } from "./helpers";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string | null | undefined }) {
  const t = useTranslations("intent");
  const { data, isLoading, isError } = usePrIntent(prId);
  const regenerate = useRegenerateIntent(prId);

  if (isLoading) {
    return (
      <section>
        <SectionLabel icon="Target">{t("title")}</SectionLabel>
        <Skeleton height={110} />
      </section>
    );
  }

  // Hard failure (network/API down) — the intent card is non-essential; the
  // rest of the Overview tab still renders.
  if (isError || !data) return null;

  const { intent: record, unavailable_reason } = data;

  if (!record) {
    if (unavailable_reason === "provider_not_configured") {
      return (
        <section>
          <SectionLabel icon="Target">{t("title")}</SectionLabel>
          <div style={s.inlineNote}>
            <Icon.Info size={14} />
            <span>{t("providerNotConfigured")}</span>
          </div>
        </section>
      );
    }
    if (unavailable_reason === "generation_failed") {
      return (
        <section>
          <SectionLabel icon="Target">{t("title")}</SectionLabel>
          <div style={s.inlineNote}>
            <Icon.AlertTriangle size={14} />
            <span>{t("generationFailed")}</span>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={regenerate.isPending}
              onClick={() => regenerate.mutate()}
            >
              {t("retry")}
            </Button>
          </div>
        </section>
      );
    }
    // 'not_generated': the hook auto-POSTs once, so this is a brief transient
    // state between the GET and the POST resolving — render nothing rather
    // than flash a state that's about to change.
    return null;
  }

  const lowConfidence = record.confidence === "low";
  const why = whyLineInfo(record.sources);
  const caption = captionFor(record);
  const whyKey =
    why.sources.length === 0
      ? "why.limited"
      : why.descriptionMissing && why.issueMissing
        ? "why.noDescriptionNoIssue"
        : why.descriptionMissing
          ? "why.noDescription"
          : "why.base";
  const whySourcesText = joinWithAnd(why.sources.map((src) => t(`why.source.${SOURCE_I18N_KEY[src]}`)));

  return (
    <section>
      <SectionLabel
        icon="Target"
        right={
          lowConfidence ? (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("lowConfidenceBadge")}
            </Badge>
          ) : undefined
        }
      >
        {t("title")}
      </SectionLabel>

      <div style={s.card(lowConfidence)}>
        <p style={s.statement}>{record.intent}</p>

        <div style={s.columns}>
          <div>
            <div style={s.columnLabel}>{t("inScope")}</div>
            {record.in_scope.length === 0 ? (
              <span style={s.muted}>{t("noneIdentified")}</span>
            ) : (
              <ul style={s.bulletList}>
                {record.in_scope.map((item, i) => (
                  <li key={i} style={s.bulletItem}>
                    <Icon.Check size={13} style={s.bulletIcon("var(--ok)")} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div style={s.columnLabel}>{t("outOfScope")}</div>
            {record.out_of_scope.length === 0 ? (
              <span style={s.muted}>{t("noneIdentified")}</span>
            ) : (
              <ul style={s.bulletList}>
                {record.out_of_scope.map((item, i) => (
                  <li key={i} style={s.bulletItem}>
                    <Icon.X size={13} style={s.bulletIcon("var(--crit)")} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {record.ticket_refs.length > 0 && (
          <div style={s.muted}>{t("referencesLabel", { refs: record.ticket_refs.join(", ") })}</div>
        )}

        {!lowConfidence && caption?.kind === "description" && (
          <div style={s.muted}>{t("caption.fromDescription")}</div>
        )}
        {!lowConfidence && caption?.kind === "description_issue" && (
          <div style={s.muted}>{t("caption.fromDescriptionAndIssue", { number: caption.issue })}</div>
        )}
        {!lowConfidence && caption?.kind === "issue" && (
          <div style={s.muted}>{t("caption.fromIssue", { number: caption.issue })}</div>
        )}

        {lowConfidence && (
          <>
            <div style={s.whyLine}>{t(whyKey, { sources: whySourcesText })}</div>
            <div style={s.actionHint}>{t("actionHint")}</div>
          </>
        )}

        {record.stale && (
          <div style={s.footerRow}>
            <Chip icon="AlertOctagon" color="var(--warn)">
              {t("stale")}
            </Chip>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={regenerate.isPending}
              onClick={() => regenerate.mutate()}
            >
              {t("regenerate")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
