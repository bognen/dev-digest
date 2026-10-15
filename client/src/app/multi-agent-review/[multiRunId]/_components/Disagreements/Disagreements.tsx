/* Disagreements — "Where agents disagree" (design: screen_multiagent.jsx
   ConflictsSection). Rendered below both the Columns and Tabs views from the
   same buildDisagreementRows; read-only (never writes, AC-14). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel, SEV, Toggle, type Severity } from "@devdigest/ui";
import type { MultiRunChild } from "@devdigest/shared";
import { statusColor } from "@/lib/multi-run";
import { buildDisagreementRows, type DisagreementCell, type DisagreementRow } from "./helpers";
import { s } from "./styles";

type Translate = ReturnType<typeof useTranslations<"multiAgent">>;

function CellView({
  cell,
  expanded,
  t,
}: {
  cell: DisagreementCell;
  expanded: boolean;
  t: Translate;
}) {
  const name = cell.agentName ?? t("results.deletedAgent");
  let color = "var(--text-muted)";
  let label: string;
  let flagged = false;
  if (cell.kind === "flagged") {
    flagged = true;
    color = (SEV[cell.severity as Severity] ?? SEV.INFO).c;
    label =
      cell.count > 1
        ? t("disagree.flagged", { severity: cell.severity, count: cell.count })
        : cell.severity;
  } else if (cell.kind === "status") {
    color = statusColor(cell.status as MultiRunChild["status"]);
    label = t(`results.status.${cell.status as MultiRunChild["status"]}`);
  } else {
    label = t("disagree.didNotFlag");
  }
  return (
    <div style={s.cell}>
      <div style={s.agent}>{name}</div>
      <div style={s.verdictRow}>
        <span aria-hidden style={s.dot(color)} />
        <span style={s.verdict(flagged)}>{label}</span>
      </div>
      {expanded && cell.kind === "flagged" && (
        <ul style={s.findingList}>
          {cell.findings.map((f) => (
            <li key={f.id}>
              <div style={s.findingTitle}>{f.title}</div>
              <div className="mono" style={s.findingFile}>
                {f.file}:{f.start_line}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RowCard({ row, t }: { row: DisagreementRow; t: Translate }) {
  const [open, setOpen] = React.useState(false);
  return (
    <li style={s.card}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.cardHeader}>
        <Icon.Code size={13} style={s.codeIcon} />
        <span className="mono" style={s.location}>
          {t("disagree.rowLabel", { file: row.file, line: row.line })}
        </span>
        <span style={s.title}>{row.title}</span>
        <Icon.ChevronDown size={14} style={s.chevron(open)} />
      </button>
      <div style={s.cells(row.cells.length)}>
        {row.cells.map((cell) => (
          <CellView key={cell.runId} cell={cell} expanded={open} t={t} />
        ))}
      </div>
    </li>
  );
}

export function Disagreements({ runs }: { runs: MultiRunChild[] }) {
  const t = useTranslations("multiAgent");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const rows = React.useMemo(() => buildDisagreementRows(runs), [runs]);
  const visible = onlyConflicts ? rows.filter((r) => r.isConflict) : rows;

  // One agent has nothing to compare against: a note replaces groups + toggle.
  if (runs.length === 1) {
    return (
      <section style={s.root}>
        <SectionLabel icon="Activity">{t("disagree.title")}</SectionLabel>
        <p style={s.note}>{t("disagree.singleAgent")}</p>
      </section>
    );
  }

  return (
    <section style={s.root}>
      <SectionLabel
        icon="Activity"
        right={
          <label style={s.toggleLabel}>
            {t("disagree.onlyConflicts")}
            <Toggle on={onlyConflicts} onChange={setOnlyConflicts} size={15} />
          </label>
        }
      >
        {t("disagree.title")}
      </SectionLabel>
      {rows.length === 0 ? (
        <p style={s.note}>{t("disagree.noFindings")}</p>
      ) : visible.length === 0 ? (
        <p style={s.note}>{t("disagree.noConflicts")}</p>
      ) : (
        <ul style={s.list}>
          {visible.map((row) => (
            <RowCard key={row.key} row={row} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}
