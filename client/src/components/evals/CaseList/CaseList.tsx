/* CaseList — an owner's eval cases: last-result icon, name, "expected N, got M",
   expectation tag (SEVERITY · category / must not flag / empty []) and per-case
   run / edit / delete actions (AC-9). Delete asks for confirmation (AC-11). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog, Icon, IconBtn } from "@devdigest/ui";
import type { EvalCaseDetail } from "@devdigest/shared";
import { expectationSummary } from "@/lib/eval-format";
import { s } from "./styles";

export function CaseList({
  cases,
  busyCaseId,
  runDisabled,
  onRun,
  onEdit,
  onDelete,
}: {
  cases: EvalCaseDetail[];
  /** Case currently being run on its own. */
  busyCaseId?: string | null;
  runDisabled?: boolean;
  onRun: (c: EvalCaseDetail) => void;
  onEdit: (c: EvalCaseDetail) => void;
  onDelete: (c: EvalCaseDetail) => void;
}) {
  const t = useTranslations("eval");
  const [confirming, setConfirming] = React.useState<EvalCaseDetail | null>(null);

  return (
    <>
      <ul style={s.list} aria-label={t("cases.heading")}>
        {cases.map((c) => (
          <li key={c.id} style={s.row} data-case-id={c.id}>
            <StatusIcon c={c} busy={busyCaseId === c.id} />
            <div style={s.main}>
              <div style={s.name}>{c.name}</div>
              <div style={s.sub}>
                <ResultLine c={c} />
              </div>
            </div>
            <ExpectationTag c={c} />
            <span style={s.actions}>
              {!runDisabled && busyCaseId !== c.id && (
                <IconBtn icon="Play" label={t("cases.runCase", { name: c.name })} onClick={() => onRun(c)} />
              )}
              <IconBtn icon="Edit" label={t("cases.editCase", { name: c.name })} onClick={() => onEdit(c)} />
              <IconBtn icon="Trash" danger label={t("cases.deleteCase", { name: c.name })} onClick={() => setConfirming(c)} />
            </span>
          </li>
        ))}
      </ul>
      {confirming && (
        <ConfirmDialog
          danger
          title={t("cases.deleteTitle")}
          message={t("cases.deleteBody", { name: confirming.name })}
          confirmLabel={t("cases.delete")}
          cancelLabel={t("cases.cancel")}
          onConfirm={() => {
            onDelete(confirming);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}

function StatusIcon({ c, busy }: { c: EvalCaseDetail; busy: boolean }) {
  const t = useTranslations("eval");
  if (busy) return <Icon.RefreshCw size={18} style={s.spin} aria-label={t("cases.running")} />;
  const status = c.last_result?.status;
  if (status === "pass") return <Icon.CheckCircle size={18} style={s.ok} aria-label={t("cases.statusPass")} />;
  if (status === "fail") return <Icon.XCircle size={18} style={s.bad} aria-label={t("cases.statusFail")} />;
  if (status === "error") return <Icon.AlertTriangle size={18} style={s.warn} aria-label={t("cases.statusError")} />;
  return <Icon.Dot size={18} style={s.muted} aria-label={t("cases.statusNever")} />;
}

function ResultLine({ c }: { c: EvalCaseDetail }) {
  const t = useTranslations("eval");
  const r = c.last_result;
  if (!r) return <>{t("cases.neverRun")}</>;
  if (r.status === "error") return <>{t("cases.errored", { error: r.error ?? "" })}</>;
  if (r.expected_findings === 0 && c.expected_output.expectations.length > 0) {
    return <>{t("cases.mustNotFlagResult", { got: r.got_findings })}</>;
  }
  return <>{t("cases.expectedGot", { expected: r.expected_findings, got: r.got_findings })}</>;
}

function ExpectationTag({ c }: { c: EvalCaseDetail }) {
  const t = useTranslations("eval");
  const sum = expectationSummary(c.expected_output);
  const text =
    sum.kind === "must_find"
      ? [sum.severity, sum.category].filter(Boolean).join(" · ") || t("editor.mustFind")
      : sum.kind === "must_not_flag"
        ? t("cases.tagMustNotFlag")
        : t("cases.tagClean");
  return <span style={s.tag}>{text}</span>;
}
