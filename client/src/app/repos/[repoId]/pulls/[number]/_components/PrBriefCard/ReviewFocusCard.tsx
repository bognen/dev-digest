/* ReviewFocusCard — full-width "Review focus - read these first" card shown
   below the Overview grid (SPEC-05 AC-11..AC-15). Header carries a count badge
   only when there are items; the list keeps its own empty text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, SectionLabel } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { ReviewFocusList } from "./ReviewFocusList";
import { s } from "./styles";

export function ReviewFocusCard({
  items,
  repoFullName,
  headSha,
  onNavigate,
  notInDiffKey,
}: {
  items: ReviewFocusItem[];
  repoFullName?: string | null;
  headSha?: string | null;
  onNavigate?: (key: string, file: string, line: number | null) => void;
  notInDiffKey?: string | null;
}) {
  const t = useTranslations("brief");
  const id = React.useId();

  return (
    <section aria-labelledby={id} style={s.focusCard}>
      <SectionLabel
        right={
          items.length > 0 ? (
            <span data-testid="review-focus-count">
              <Badge>{items.length}</Badge>
            </span>
          ) : undefined
        }
      >
        <span id={id}>{t("section.focus")}</span>
      </SectionLabel>
      <ReviewFocusList
        items={items}
        repoFullName={repoFullName}
        headSha={headSha}
        onNavigate={onNavigate}
        notInDiffKey={notInDiffKey}
      />
    </section>
  );
}
