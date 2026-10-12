"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { TourCriticalPaths } from "@devdigest/shared";
import { OpenLink } from "../OpenLink";
import { TourSectionCard } from "../TourSectionCard";
import { s } from "./styles";

interface CriticalPathsSectionProps {
  section: TourCriticalPaths;
  fullName: string | undefined;
  sha: string | undefined;
}

/** Paths and roles render as text only (React escaping, AC-35). */
export function CriticalPathsSection({ section, fullName, sha }: CriticalPathsSectionProps) {
  const t = useTranslations("onboarding");
  return (
    <TourSectionCard sectionKey="critical_paths" state={section.state} reason={section.reason}>
      <ul style={s.list}>
        {section.items.map((item) => (
          <li key={item.path} style={s.row}>
            <Icon.FileText size={14} style={s.icon} />
            <div style={s.text}>
              <span className="mono" style={s.path}>
                {item.path}
              </span>
              <span style={s.role}> — {item.role}</span>
              <div style={s.meta}>{t("paths.importedBy", { count: item.importers })}</div>
            </div>
            <OpenLink path={item.path} fullName={fullName} sha={sha} />
          </li>
        ))}
      </ul>
    </TourSectionCard>
  );
}
