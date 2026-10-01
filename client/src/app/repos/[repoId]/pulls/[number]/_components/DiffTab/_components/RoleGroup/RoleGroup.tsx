/* RoleGroup — one smart-diff group: collapsible header (chevron, role swatch,
   label + description, files-with-findings count, "N files") over a DiffViewer
   of the group's files. Docs/boilerplate start collapsed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { COLLAPSED_BY_DEFAULT, ROLE_META } from "../../constants";
import { filesWithFindingsCount, type MergedGroup } from "../../helpers";
import { s, chevronFor, swatchFor } from "./styles";

export function RoleGroup({
  group,
  commenting,
  findings,
}: {
  group: MergedGroup;
  commenting: DiffCommentApi;
  findings: DiffFindingApi;
}) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[group.role];
  const [open, setOpen] = React.useState(!COLLAPSED_BY_DEFAULT.includes(group.role));
  const withFindings = filesWithFindingsCount(group);

  return (
    <div style={s.wrap}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.header}>
        <Icon.ChevronRight size={14} style={chevronFor(open)} />
        <span aria-hidden="true" style={swatchFor(meta.color)} />
        <span style={s.text}>
          <span style={s.label}>{t(meta.labelKey)}</span>
          <span style={s.description}>{t(meta.descriptionKey)}</span>
        </span>
        {withFindings > 0 && (
          <span style={s.findingsBadge} aria-label={t("smartDiff.filesWithFindings", { count: withFindings })}>
            <span aria-hidden="true" style={s.findingsDot} />
            {withFindings}
          </span>
        )}
        <span style={s.count}>{t("smartDiff.filesCount", { count: group.files.length })}</span>
      </button>
      {open && <DiffViewer files={group.files} commenting={commenting} findings={findings} />}
    </div>
  );
}
