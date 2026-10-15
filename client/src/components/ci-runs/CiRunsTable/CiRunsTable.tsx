/* CiRunsTable — the read-only CI runs table (design N13): shared by the CI Runs
   page and the agent CI tab. All artifact-derived text is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink, SEV } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { CI_RUNS_COLUMNS, CI_STATUS_STYLE, REJECT_REASONS } from "./constants";
import { findingItems, formatDuration, formatRunCost, formatRunTime, safeRunUrl } from "./helpers";
import { findingStyle, s } from "./styles";

type Translate = ReturnType<typeof useTranslations>;

export function CiRunsTable({ runs }: { runs: CiRun[] }) {
  const t = useTranslations("ci");
  return (
    <div role="table" style={s.table}>
      <div role="row" style={s.head}>
        {CI_RUNS_COLUMNS.map((c, i) => (
          <div key={i} role="columnheader">
            {c ? t(`runs.table.${c}`) : null}
          </div>
        ))}
      </div>
      {runs.map((r, i) => (
        <CiRunRow key={r.id} run={r} last={i === runs.length - 1} t={t} />
      ))}
    </div>
  );
}

function reasonText(r: CiRun, t: Translate): string | undefined {
  if (r.status === "skipped") return t("runs.reason.secretsUnavailable");
  if (r.status === "result_expired") return t("runs.reason.resultExpired");
  if (r.status === "rejected" && (REJECT_REASONS as readonly string[]).includes(r.reason ?? "")) {
    return t(`runs.reason.${r.reason as (typeof REJECT_REASONS)[number]}`);
  }
  return undefined;
}

function CiRunRow({ run: r, last, t }: { run: CiRun; last: boolean; t: Translate }) {
  const st = CI_STATUS_STYLE[r.status];
  const url = safeRunUrl(r.run_url, r.repo);
  const prLabel = r.pr_number != null ? `#${r.pr_number}` : null;
  const items = findingItems(r);
  return (
    <div role="row" style={{ ...s.row, ...(last ? null : s.rowBorder) }}>
      <span role="cell" className="mono" style={s.ts}>
        {formatRunTime(r.ran_at)}
      </span>
      <div role="cell" style={s.prCell}>
        {prLabel && (
          <span className="mono" style={s.prNum}>
            {prLabel}
          </span>
        )}{" "}
        <span style={s.prTitle} title={r.repo}>
          {r.repo}
        </span>
      </div>
      <span role="cell" style={s.agent}>
        <Icon.Cpu size={13} style={s.agentIcon} />
        <span style={s.agentName}>{r.agent_name ?? r.agent_slug ?? "—"}</span>
        {r.installation_status === "removed" && <span style={s.removed}>{t("runs.removedAgent")}</span>}
      </span>
      <span role="cell">
        <Badge color="var(--text-secondary)" icon="Workflow">
          {t("runs.source.githubActions")}
        </Badge>
      </span>
      <span role="cell" className="tnum" style={s.dur}>
        {formatDuration(r.duration_ms)}
      </span>
      <div role="cell">
        {items.length === 0 ? (
          <span style={s.none}>—</span>
        ) : (
          <div style={s.findings}>
            {items.map(({ sev, n }) => {
              const v = SEV[sev];
              const I = Icon[v.icon];
              return (
                <span key={sev} style={findingStyle(v.c)} title={v.label}>
                  <I size={12} />
                  <span className="tnum">{n}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
      <span role="cell" className="mono tnum" style={s.cost}>
        {formatRunCost(r.cost_usd)}
      </span>
      <div role="cell" style={s.statusCell} title={reasonText(r, t)}>
        <Badge color={st.c} bg={st.bg} dot>
          {t(`runs.status.${st.label}`)}
        </Badge>
        {r.partial && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" style={s.partial}>
            {t("runs.partial")}
            {r.skipped_count > 0 ? ` · ${t("runs.skippedFiles", { count: r.skipped_count })}` : ""}
          </Badge>
        )}
      </div>
      <span role="cell" style={s.linkCell}>
        {url && (
          <MonoLink href={url}>
            {t("runs.trace")}
            <span style={s.srOnly}>{` ${r.repo}${prLabel ? ` ${prLabel}` : ""}`}</span>
          </MonoLink>
        )}
      </span>
    </div>
  );
}
