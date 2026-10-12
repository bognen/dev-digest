"use client";

import { useTranslations } from "next-intl";
import type { TourReadingPath } from "@devdigest/shared";
import { OpenLink } from "../OpenLink";
import { TourSectionCard } from "../TourSectionCard";
import { s } from "./styles";

interface ReadingPathSectionProps {
  section: TourReadingPath;
  fullName: string | undefined;
  sha: string | undefined;
}

export function ReadingPathSection({ section, fullName, sha }: ReadingPathSectionProps) {
  const t = useTranslations("onboarding");
  const { hotness } = section;
  // AC-9: say so when recent-activity ranking was not applied (note carries how much history existed).
  const hotnessNote = hotness.note ?? (hotness.applied ? null : t("reading.hotnessNotApplied"));
  return (
    <TourSectionCard sectionKey="reading_path" state={section.state} reason={section.reason}>
      <ol style={s.list}>
        {section.items.map((item) => (
          <li key={item.path} style={s.row}>
            <span style={s.badge} aria-label={t("reading.step", { position: item.position })}>
              {item.position}
            </span>
            <div style={s.text}>
              <div className="mono" style={s.path}>
                {item.path}
              </div>
              <div style={s.reason}>{item.reason}</div>
            </div>
            <OpenLink path={item.path} fullName={fullName} sha={sha} />
          </li>
        ))}
      </ol>
      {hotnessNote && <p style={s.hotness}>{hotnessNote}</p>}
    </TourSectionCard>
  );
}
