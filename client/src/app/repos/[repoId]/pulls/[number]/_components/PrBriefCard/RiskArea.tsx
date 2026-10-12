/* RiskArea — one risk in the RISK AREAS list (AC-37). Collapsed: severity +
   kind + title + file refs. Expanded (aria-expanded button): the explanation.
   With `onNavigate` wired (useBriefNavigation) each file ref is a button that
   focuses it in Files changed, or shows an inline "not in this PR's diff"
   notice whose secondary link goes to the repository host, pinned to the
   brief's OWN provenance head sha — a risk may cite a downstream caller file
   this PR does not change (AC-16). Without `onNavigate` refs stay plain links. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown, MonoLink } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { RISK_KIND_META, SEVERITY_COLOR } from "./constants";
import { isSafeRepoPath, splitFileRef } from "./helpers";
import { NotInDiffNotice } from "./_components/NotInDiffNotice";
import { s } from "./styles";

export function RiskArea({
  risk,
  repoFullName,
  headSha,
  navKeyPrefix = "risk",
  onNavigate,
  notInDiffKey,
}: {
  risk: Risk;
  repoFullName?: string | null;
  headSha?: string | null;
  navKeyPrefix?: string;
  onNavigate?: (key: string, file: string, line: number | null) => void;
  notInDiffKey?: string | null;
}) {
  const t = useTranslations("brief");
  const [expanded, setExpanded] = React.useState(false);
  const meta = RISK_KIND_META[risk.kind];
  const I = Icon[meta.icon];
  const sevColor = SEVERITY_COLOR[risk.severity];

  return (
    <div style={s.riskCard}>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)} style={s.riskHeader}>
        <span style={s.sevDot(sevColor)} aria-hidden />
        <span style={s.sevLabel(sevColor)}>{t(`risk.level.${risk.severity}`)}</span>
        <I size={14} style={{ color: meta.color, flexShrink: 0 }} />
        <span style={s.kindLabel}>{t(`risk.kind.${risk.kind}`)}</span>
        <span style={s.riskTitle}>{risk.title}</span>
        <Icon.ChevronDown size={14} style={s.chevron(expanded)} />
      </button>
      {expanded && (
        <div style={s.riskBody}>
          <div style={s.prose}>
            <Markdown>{risk.explanation}</Markdown>
          </div>
          {risk.file_refs.length > 0 && (
            <div style={s.refRow}>
              {risk.file_refs.map((ref) => {
                const { file, line } = splitFileRef(ref);
                const href =
                  repoFullName && headSha && isSafeRepoPath(file) ? githubBlobUrl(repoFullName, headSha, file, line, line) : undefined;
                if (!onNavigate) {
                  return (
                    <MonoLink key={ref} href={href}>
                      {ref}
                    </MonoLink>
                  );
                }
                const key = `${navKeyPrefix}:${ref}`;
                return (
                  <span key={ref} style={s.refItem}>
                    <button type="button" style={s.refButton} onClick={() => onNavigate(key, file, line ?? null)}>
                      <span className="mono">{ref}</span>
                    </button>
                    {notInDiffKey === key && <NotInDiffNotice externalHref={href} />}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
