"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingSectionState } from "@devdigest/shared";
import { SECTION_ICONS, type SectionKey } from "../../constants";
import { sectionId } from "../../helpers";
import { s } from "./styles";

interface TourSectionCardProps {
  sectionKey: SectionKey;
  state: OnboardingSectionState;
  reason: string | null;
  children: React.ReactNode;
}

/** Collapsible card. The header is a native button (Enter/Space) with aria-expanded/aria-controls. */
export function TourSectionCard({ sectionKey, state, reason, children }: TourSectionCardProps) {
  const t = useTranslations("onboarding");
  const [open, setOpen] = React.useState(true);
  const bodyId = `${sectionId(sectionKey)}-body`;
  const SectionIcon = Icon[SECTION_ICONS[sectionKey]];
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <section id={sectionId(sectionKey)} style={s.card} aria-labelledby={`${sectionId(sectionKey)}-title`}>
      <h2 style={s.heading}>
        <button
          type="button"
          style={s.header}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          <span style={s.iconBox} aria-hidden="true">
            <SectionIcon size={16} />
          </span>
          <span id={`${sectionId(sectionKey)}-title`} style={s.title}>
            {t(`section.${sectionKey}`)}
          </span>
          <span style={s.chevron}>
            <Chevron size={16} aria-label={open ? t("section.collapse") : t("section.expand")} />
          </span>
        </button>
      </h2>
      <div id={bodyId} hidden={!open} style={s.body}>
        {state === "not_available" && (
          <p style={s.note}>
            {reason ? t("section.notAvailable", { reason }) : t("section.notAvailableNoReason")}
          </p>
        )}
        {state === "requires_generation" && <p style={s.note}>{t("section.requiresGeneration")}</p>}
        {(state === "ok" || state === "requires_generation") && children}
      </div>
    </section>
  );
}
