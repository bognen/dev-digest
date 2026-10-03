/* RoleGroup — one smart-diff group: collapsible header (chevron, role swatch,
   label + description, files-with-findings count, "N files") over a DiffViewer
   of the group's files. Docs/boilerplate start collapsed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi, isAutoExpanded } from "@/components/diff-viewer";
import type { PrFile } from "@/lib/types";
import { COLLAPSED_BY_DEFAULT, ROLE_META } from "../../constants";
import { type MergedGroup } from "../../helpers";
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
  const isEmpty = group.files.length === 0;
  const [open, setOpen] = React.useState(!COLLAPSED_BY_DEFAULT.includes(group.role));
  const withFindings = group.files.reduce((n, f) => n + (findings.openFindingCount?.(f.path) ?? 0), 0);
  // Per-file overrides of the default (auto-expand small files); the toggle's
  // label is derived from the real state, so it stays in sync with manual clicks.
  const [overrides, setOverrides] = React.useState<ReadonlyMap<string, boolean>>(new Map());
  const isOpen = (f: PrFile) => overrides.get(f.path) ?? isAutoExpanded(f);
  const allOpen = group.files.every(isOpen);
  const toggleFile = (f: PrFile) => setOverrides((m) => new Map(m).set(f.path, !isOpen(f)));
  const toggleAll = () => {
    const next = !allOpen;
    setOverrides(new Map(group.files.map((f) => [f.path, next])));
    if (next) setOpen(true); // expanding all also reveals a collapsed group
  };

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <button
          type="button"
          aria-expanded={!isEmpty && open}
          disabled={isEmpty}
          onClick={() => setOpen((o) => !o)}
          style={s.header}
        >
          <Icon.ChevronRight size={14} style={chevronFor(open)} />
          <span aria-hidden="true" style={swatchFor(meta.color)} />
          <span style={s.text}>
            <span style={s.label}>{t(meta.labelKey)}</span>
            <span style={s.description}>{t(meta.descriptionKey)}</span>
          </span>
          {withFindings > 0 && (
            <span style={s.findingsBadge} aria-label={t("smartDiff.findingsCount", { count: withFindings })}>
              <span aria-hidden="true" style={s.findingsDot} />
              {withFindings}
            </span>
          )}
          <span style={s.count}>{t("smartDiff.filesCount", { count: group.files.length })}</span>
        </button>
        {!isEmpty && (
          <button type="button" onClick={toggleAll} style={s.toggleAll}>
            <Icon.ChevronsUpDown size={12} />
            {t(allOpen ? "smartDiff.collapseAll" : "smartDiff.expandAll")}
          </button>
        )}
      </div>
      {open && !isEmpty && (
        <DiffViewer
          files={group.files}
          commenting={commenting}
          findings={findings}
          isOpen={isOpen}
          onToggleFile={toggleFile}
        />
      )}
    </div>
  );
}
