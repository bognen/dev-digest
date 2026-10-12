"use client";

import { useTranslations } from "next-intl";
import { SECTION_ORDER, type SectionKey } from "../../constants";
import { sectionId } from "../../helpers";
import { s } from "./styles";

interface SectionNavProps {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}

/** "On this page" navigation: five entries in fixed order; the active one has aria-current. */
export function SectionNav({ active, onSelect }: SectionNavProps) {
  const t = useTranslations("onboarding");
  return (
    <nav aria-label={t("nav.label")} style={s.nav}>
      <div style={s.label}>{t("nav.label")}</div>
      <ul style={s.list}>
        {SECTION_ORDER.map((key) => {
          const isActive = key === active;
          return (
            <li key={key}>
              <a
                href={`#${sectionId(key)}`}
                aria-current={isActive ? "true" : undefined}
                style={isActive ? { ...s.item, ...s.itemActive } : s.item}
                onClick={(e) => {
                  e.preventDefault();
                  onSelect(key);
                }}
              >
                {t(`section.${key}`)}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
