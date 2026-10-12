/* GeneratingSkeleton — placeholder for the brief body (badge, what/why) while a
   brief is being generated or regenerated. The bars are decorative
   (aria-hidden); a single polite live region announces the state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { s } from "./styles";

export function GeneratingSkeleton() {
  const t = useTranslations("brief");
  return (
    <div style={s.root}>
      <div style={s.bars} aria-hidden="true">
        <Skeleton height={20} width={240} />
        <Skeleton height={44} />
      </div>
      <span role="status" aria-live="polite" style={s.status}>
        {t("status.generating")}
      </span>
    </div>
  );
}
