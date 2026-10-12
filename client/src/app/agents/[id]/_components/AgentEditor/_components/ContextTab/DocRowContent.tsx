"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox } from "@devdigest/ui";
import type { ProjectDocRoot } from "@devdigest/shared";
import { ROOT_COLORS } from "./constants";
import { splitPath } from "./helpers";
import { s } from "./styles";

export interface DocRowContentProps {
  path: string;
  root: ProjectDocRoot;
  tokens: number | null;
  /** Text label for a problem state (missing, too large, dropped...); shown in words, never colour only. */
  status?: string | null;
  /** Checkbox state; `undefined` renders a read-only row (inherited) with no checkbox. */
  checked?: boolean;
  /** Row has no checkbox because it cannot be attached (too-large docs). */
  inert?: boolean;
  /** Secondary text, e.g. "via <skill>". */
  note?: string | null;
  onToggle?: (path: string) => void;
  /** Absent = no Preview button. */
  onPreview?: (path: string) => void;
  /** Leading slot: the drag handle on attached rows. */
  handle?: React.ReactNode;
}

/** Inner layout shared by attached (sortable), available and inherited rows (AC-14, AC-26, NFR-7). */
export function DocRowContent({
  path,
  root,
  tokens,
  status,
  checked,
  inert,
  note,
  onToggle,
  onPreview,
  handle,
}: DocRowContentProps) {
  const t = useTranslations("agents");
  const { name, dir } = splitPath(path);
  const colors = ROOT_COLORS[root];
  const title = (
    <span style={s.label} title={path}>
      <span className="mono" style={s.name}>
        {name}
      </span>
      <span className="mono" style={s.dir}>
        {dir}
      </span>
    </span>
  );
  return (
    <>
      {handle ?? <span style={s.handleSpacer} aria-hidden="true" />}
      {checked === undefined || inert ? (
        title
      ) : (
        <span aria-label={t("context.attachLabel", { name: path })} role="group">
          <Checkbox checked={checked} onChange={() => onToggle?.(path)} label={title} />
        </span>
      )}
      <span style={s.trailing}>
        {note && <span style={s.metaText}>{note}</span>}
        {status && <span style={s.statusText}>{status}</span>}
        {tokens !== null && !status && <span style={s.metaText}>{t("context.tokens", { count: tokens })}</span>}
        <Badge mono color={colors.color} bg={colors.bg}>
          {root}
        </Badge>
        {onPreview && (
          <Button
            kind="secondary"
            size="sm"
            icon="Eye"
            aria-label={t("context.previewLabel", { name: path })}
            onClick={() => onPreview(path)}
          >
            {t("context.preview")}
          </Button>
        )}
      </span>
    </>
  );
}
