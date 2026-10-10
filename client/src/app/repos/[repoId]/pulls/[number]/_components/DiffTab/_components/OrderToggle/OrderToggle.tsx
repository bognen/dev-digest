/* OrderToggle — "Smart order | Original order" segmented control (two
   aria-pressed buttons; the design system has no segmented primitive). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s, optionFor } from "./styles";

export type DiffOrder = "smart" | "original";

const OPTIONS: ReadonlyArray<{ value: DiffOrder; labelKey: string }> = [
  { value: "smart", labelKey: "smartDiff.smartOrder" },
  { value: "original", labelKey: "smartDiff.originalOrder" },
];

export function OrderToggle({ order, onChange }: { order: DiffOrder; onChange: (o: DiffOrder) => void }) {
  const t = useTranslations("prReview");
  return (
    <div role="group" aria-label={t("smartDiff.orderToggleLabel")} style={s.wrap}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={order === o.value}
          onClick={() => onChange(o.value)}
          style={optionFor(order === o.value)}
        >
          {t(o.labelKey)}
        </button>
      ))}
    </div>
  );
}
