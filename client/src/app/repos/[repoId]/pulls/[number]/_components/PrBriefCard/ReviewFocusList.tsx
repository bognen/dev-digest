/* ReviewFocusList — the ordered REVIEW FOCUS list (AC-38). Each entry is a
   REASON TO LOOK, never an asserted defect (D3) — rendered as an ordered
   list, each with its file ref and one-sentence reason. When `onNavigate` is
   wired (useBriefNavigation) each ref is a keyboard-operable button that
   focuses the file/line in Files changed, or shows an inline "not in this PR's
   diff" notice. Without it, refs fall back to the repository-host link (pinned
   to the brief's OWN provenance head sha). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MonoLink } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { NotInDiffNotice } from "./_components/NotInDiffNotice";
import { isSafeRepoPath } from "./helpers";
import { s } from "./styles";

export function ReviewFocusList({
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

  if (items.length === 0) {
    return <p style={s.prose}>{t("focus.empty")}</p>;
  }

  return (
    <ol style={s.focusList}>
      {items.map((item, i) => {
        const label = item.line != null ? `${item.file}:${item.line}` : item.file;
        const key = `focus:${i}`;
        const externalHref =
          repoFullName && headSha && isSafeRepoPath(item.file)
            ? githubBlobUrl(repoFullName, headSha, item.file, item.line ?? undefined, item.line ?? undefined)
            : undefined;
        const onClick = onNavigate ? () => onNavigate(key, item.file, item.line) : null;
        return (
          <li key={`${item.file}:${item.line}:${i}`} style={s.focusItem}>
            {onClick ? (
              <button type="button" style={s.focusButton} onClick={onClick}>
                <span className="mono">{label}</span>
              </button>
            ) : (
              <MonoLink href={externalHref}>{label}</MonoLink>
            )}
            <span style={s.focusReason}>{item.reason}</span>
            {onNavigate && notInDiffKey === key && <NotInDiffNotice externalHref={externalHref} />}
          </li>
        );
      })}
    </ol>
  );
}
