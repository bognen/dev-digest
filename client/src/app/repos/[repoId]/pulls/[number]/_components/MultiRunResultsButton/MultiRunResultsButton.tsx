/* MultiRunResultsButton — "Multi-agent results" link in the PR header, shown
   only while the PR has at least one multi-run (AC-40). Links to the latest
   multi-run's results page; a status dot (with a text label) marks a run in
   progress. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { useLatestMultiRun } from "@/lib/hooks/multi-agent";
import { s } from "./styles";

export function MultiRunResultsButton({ prId }: { prId: string }) {
  const t = useTranslations("prReview");
  const { data } = useLatestMultiRun(prId);
  const latest = data?.multi_run;
  if (!latest) return null;
  const running = latest.status === "running";

  return (
    <Link
      href={`/multi-agent-review/${encodeURIComponent(latest.id)}`}
      style={s.link}
      aria-label={running ? t("multiRunResults.buttonRunning") : undefined}
    >
      <Icon.Users size={14} />
      {t("multiRunResults.button")}
      {running && <span aria-hidden title={t("multiRunResults.running")} style={s.dot} />}
    </Link>
  );
}
