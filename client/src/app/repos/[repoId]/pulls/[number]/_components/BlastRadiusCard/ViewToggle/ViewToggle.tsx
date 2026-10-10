"use client";

import { useTranslations } from "next-intl";
import { BLAST_VIEWS, type BlastView } from "../constants";
import { s } from "./styles";

interface ViewToggleProps {
  value: BlastView;
  onChange: (view: BlastView) => void;
}

/** Tree/Graph switch: a group of toggle buttons (aria-pressed marks the active one). */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const t = useTranslations("blast");
  return (
    <div role="group" aria-label={t("view.label")} style={s.group}>
      {BLAST_VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={value === view}
          style={s.button(value === view)}
          onClick={() => onChange(view)}
        >
          {t(`view.${view}`)}
        </button>
      ))}
    </div>
  );
}
