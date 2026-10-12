"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { isAttachBlocked, type ContextRow } from "./helpers";
import { s } from "./styles";

export interface DocRowProps {
  row: ContextRow;
  open: boolean;
  onToggle: (path: string) => void;
  onTogglePreview: (path: string) => void;
  /** Leading slot: the drag handle on attached rows; unattached rows get an aligned spacer. */
  handle?: React.ReactNode;
}

/** One document row (checkbox, root, state/tokens, preview toggle); shared by sortable and plain rows. */
export function DocRow({ row: r, open, onToggle, onTogglePreview, handle }: DocRowProps) {
  const t = useTranslations("skills");
  return (
    <div style={s.row}>
      {handle ?? <span style={s.handleSpacer} aria-hidden="true" />}
      <label style={s.label}>
        <input
          type="checkbox"
          checked={r.attached}
          disabled={isAttachBlocked(r)}
          onChange={() => onToggle(r.path)}
          aria-label={t("context.toggleAria", { path: r.path })}
        />
        <span className="mono" style={s.path}>
          {r.path}
        </span>
      </label>
      <Badge mono>{r.root}</Badge>
      {r.state !== "ok" ? (
        <Badge>{t(`context.state.${r.state}`)}</Badge>
      ) : (
        r.tokens !== null && <span style={s.meta}>{t("context.rowTokens", { count: r.tokens })}</span>
      )}
      <button
        type="button"
        style={s.previewBtn}
        aria-expanded={open}
        aria-label={t("context.previewAria", { path: r.path })}
        onClick={() => onTogglePreview(r.path)}
      >
        <Icon.Eye size={14} />
      </button>
    </div>
  );
}
