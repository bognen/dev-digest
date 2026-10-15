/* ProjectContextBlock — the "Project context (untrusted)" row of the Prompt
   assembly: badges, copy, and an expandable list of injected docs (path +
   tokens, full text in a Modal) plus a separate skipped/dropped list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Modal } from "@devdigest/ui";
import type { ProjectContextTrace } from "@devdigest/shared";
import { PROMPT_COLORS } from "../../constants";
import { s as drawer } from "../../styles";
import { PromptModalBody } from "../PromptModalBody";
import { buildProjectContextCopyText } from "./helpers";
import { s } from "./styles";

const miniBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-muted)",
  cursor: "pointer",
};

export function ProjectContextBlock({
  context,
  specs,
}: {
  context: ProjectContextTrace;
  /** prompt_assembly.specs (block body without the heading). */
  specs: string | null | undefined;
}) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [viewing, setViewing] = React.useState<{ path: string; text: string } | null>(null);
  const copy = () => {
    void navigator.clipboard?.writeText(buildProjectContextCopyText(specs));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div style={drawer.promptRow}>
      <div onClick={() => setOpen((o) => !o)} style={drawer.promptHead}>
        <span style={drawer.promptDot(PROMPT_COLORS.specs)} />
        <span style={drawer.promptLabel}>{t("trace.prompt.projectContext")}</span>
        <Badge color="var(--warn)">{t("trace.prompt.untrusted")}</Badge>
        <Badge mono color="var(--text-muted)">
          {t("trace.prompt.docsCount", { count: context.docs.length })}
        </Badge>
        <Badge mono color="var(--text-muted)">
          {t("trace.prompt.contextTokens", { count: context.total_tokens })}
        </Badge>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            title={t("trace.prompt.copy")}
            aria-label={t("trace.prompt.copy")}
            onClick={(e) => {
              e.stopPropagation();
              copy();
            }}
            style={miniBtnStyle}
          >
            {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
          </button>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {open ? t("trace.collapse") : t("trace.expand")}
          </span>
        </span>
      </div>
      {open && (
        <div style={s.list}>
          <div style={s.subhead}>{t("trace.prompt.injectedDocs")}</div>
          {context.docs.map((d) => (
            <div key={d.path} style={s.docRow}>
              <span className="mono" style={s.path} title={d.path}>
                {d.path}
              </span>
              <Badge mono color="var(--text-muted)">
                {t("trace.prompt.contextTokens", { count: d.tokens })}
              </Badge>
              <button type="button" style={s.linkBtn} onClick={() => setViewing({ path: d.path, text: d.text })}>
                {t("trace.prompt.openFullText")}
              </button>
            </div>
          ))}
          {context.skipped.length > 0 && (
            <div style={s.skippedList}>
              <div style={s.subhead}>{t("trace.prompt.skippedDropped")}</div>
              {context.skipped.map((d) => (
                <div key={d.path} style={s.docRow}>
                  <span className="mono" style={s.path} title={d.path}>
                    {d.path}
                  </span>
                  <Badge color="var(--text-muted)">{t(`trace.prompt.skipReason.${d.reason}`)}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {viewing && (
        <Modal width={1200} title={viewing.path} onClose={() => setViewing(null)}>
          <PromptModalBody text={viewing.text} />
        </Modal>
      )}
    </div>
  );
}
