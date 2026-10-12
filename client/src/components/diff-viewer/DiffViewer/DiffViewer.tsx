/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import type { DiffFindingApi } from "../findings";
import { s } from "../styles";
import type { DiffFocusApi } from "../focus";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  findings,
  isOpen,
  onToggleFile,
  focus,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** Controlled per-file open state; omit and each card manages its own. */
  isOpen?: (file: PrFile) => boolean;
  onToggleFile?: (file: PrFile) => void;
  /** Brief-navigation focus request; omit for the default rendering. */
  focus?: DiffFocusApi;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f) => (
        <FileCard
          key={f.path}
          file={f}
          commenting={commenting}
          findings={findings}
          focus={focus}
          open={isOpen?.(f)}
          onToggle={onToggleFile ? () => onToggleFile(f) : undefined}
        />
      ))}
    </div>
  );
}
