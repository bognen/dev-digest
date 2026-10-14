/* CaseEditorModal — create / edit an eval case by hand (AC-43): name, input tabs
   Diff / Files / PR meta, a DiffViewer preview of the pasted diff, expectation
   rows (type, file, line range, labels), Run on save (AC-48) and the last-run
   result. Server validation errors (AC-44 – AC-46) are shown inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn, Modal, SelectInput, Tabs, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { EvalCaseDetail, EvalOwnerKind } from "@devdigest/shared";
import { DiffViewer } from "@/components/diff-viewer";
import { useEvalRun, useRunEvalCase, useSaveEvalCase } from "@/lib/hooks/eval";
import { ApiError } from "@/lib/api";
import { diffToPrFiles, money } from "@/lib/eval-format";
import { useEscapeKey } from "../useEscapeKey";
import {
  draftFromCase,
  draftToBody,
  emptyDraft,
  newExpectation,
  validateDraft,
  type CaseDraft,
  type DraftError,
  type ExpectationDraft,
} from "./helpers";
import { s } from "./styles";

type InputTab = "diff" | "files" | "meta";

export function CaseEditorModal({
  ownerKind,
  ownerId,
  ownerName,
  existing,
  hostAgentId,
  runDisabled,
  onClose,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
  ownerName: string;
  existing?: EvalCaseDetail | null;
  /** Skill evals: the host agent single-case runs use. */
  hostAgentId?: string;
  runDisabled?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const save = useSaveEvalCase();
  const runCase = useRunEvalCase();
  const [draft, setDraft] = React.useState<CaseDraft>(() => (existing ? draftFromCase(existing) : emptyDraft()));
  const [caseId, setCaseId] = React.useState<string | null>(existing?.id ?? null);
  const [tab, setTab] = React.useState<InputTab>("diff");
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [runId, setRunId] = React.useState<string | null>(null);
  const run = useEvalRun(runId);
  useEscapeKey(onClose);

  const preview = React.useMemo(() => diffToPrFiles(draft.diff), [draft.diff]);
  const set = <K extends keyof CaseDraft>(k: K, v: CaseDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setExp = (i: number, patch: Partial<ExpectationDraft>) =>
    set(
      "expectations",
      draft.expectations.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    );

  const draftErrorText = (e: DraftError) =>
    e.key === "nameRequired" || e.key === "diffRequired" ? t(`editor.${e.key}`) : t(`editor.${e.key}`, { n: e.n });

  const startRun = (id: string) =>
    runCase.mutate(
      { caseId: id, ...(hostAgentId ? { hostAgentId } : {}) },
      { onSuccess: (r) => setRunId(r.id), onError: (err) => setError((err as Error).message) },
    );

  const onSave = () => {
    const invalid = validateDraft(draft);
    if (invalid) return setError(draftErrorText(invalid));
    setError(null);
    save.mutate(
      { ...(caseId ? { id: caseId } : {}), body: draftToBody(draft, ownerKind, ownerId) },
      {
        onSuccess: (saved) => {
          setCaseId(saved.id);
          if (runOnSave && !runDisabled) startRun(saved.id);
          else onClose();
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
      },
    );
  };

  const title = existing ? t("editor.editTitle", { name: existing.name }) : t("editor.newTitle");
  const source = existing?.input_meta.source;

  return (
    <Modal
      width={1180}
      title={title}
      subtitle={t("editor.subtitle", { owner: ownerName })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <label style={s.runOnSave}>
            <Toggle on={runOnSave} onChange={setRunOnSave} />
            <span>{t("editor.runOnSave")}</span>
          </label>
          <span style={s.spacer} />
          <Button kind="secondary" onClick={onClose}>
            {t("editor.cancel")}
          </Button>
          {caseId && !runDisabled && (
            <Button kind="secondary" icon="Play" loading={runCase.isPending || run.data?.status === "running"} onClick={() => startRun(caseId)}>
              {t("editor.runCase")}
            </Button>
          )}
          <Button kind="primary" icon="Check" loading={save.isPending} onClick={onSave}>
            {save.isPending ? t("editor.saving") : t("editor.save")}
          </Button>
        </div>
      }
    >
      <div style={s.grid}>
        <div style={s.left}>
          <label style={s.label}>
            {t("editor.nameLabel")} <span style={s.req}>*</span>
            <TextInput mono value={draft.name} onChange={(v) => set("name", v)} placeholder={t("editor.namePlaceholder")} />
          </label>
          {source && <div style={s.source}>{t("editor.fromFinding", { repo: source.repo, pr: source.pr_number })}</div>}

          <div style={s.label}>{t("editor.inputLabel")}</div>
          <Tabs
            tabs={[
              { key: "diff", label: t("editor.tabDiff") },
              { key: "files", label: `${t("editor.tabFiles")}${draft.files.length ? ` (${draft.files.length})` : ""}` },
              { key: "meta", label: t("editor.tabMeta") },
            ]}
            value={tab}
            onChange={(k) => setTab(k as InputTab)}
            pad="0"
          />
          {tab === "diff" && (
            <>
              <Textarea
                mono
                rows={10}
                value={draft.diff}
                onChange={(v) => set("diff", v)}
                placeholder={t("editor.diffPlaceholder")}
              />
              <div style={s.subLabel}>{t("editor.preview")}</div>
              <div style={s.preview}>
                {preview.length === 0 ? (
                  <div style={s.muted}>{t("editor.previewEmpty")}</div>
                ) : (
                  <DiffViewer files={preview} />
                )}
              </div>
            </>
          )}
          {tab === "files" && (
            <div style={s.stack}>
              <div style={s.muted}>{t("editor.filesHint")}</div>
              {draft.files.map((f, i) => (
                <div key={i} style={s.fileRow}>
                  <div style={s.fileHead}>
                    <TextInput
                      mono
                      value={f.path}
                      placeholder={t("editor.filePath")}
                      onChange={(v) => set("files", draft.files.map((x, j) => (j === i ? { ...x, path: v } : x)))}
                    />
                    <IconBtn
                      icon="Trash"
                      danger
                      label={t("editor.removeFile", { path: f.path || String(i + 1) })}
                      onClick={() => set("files", draft.files.filter((_, j) => j !== i))}
                    />
                  </div>
                  <Textarea
                    mono
                    rows={6}
                    value={f.content}
                    placeholder={t("editor.fileContent")}
                    onChange={(v) => set("files", draft.files.map((x, j) => (j === i ? { ...x, content: v } : x)))}
                  />
                </div>
              ))}
              <div>
                <Button kind="ghost" size="sm" icon="Plus" onClick={() => set("files", [...draft.files, { path: "", content: "" }])}>
                  {t("editor.addFile")}
                </Button>
              </div>
            </div>
          )}
          {tab === "meta" && (
            <div style={s.stack}>
              <label style={s.label}>
                {t("editor.titleLabel")}
                <TextInput value={draft.prTitle} onChange={(v) => set("prTitle", v)} placeholder={t("editor.titlePlaceholder")} />
              </label>
              <label style={s.label}>
                {t("editor.bodyLabel")}
                <Textarea rows={6} value={draft.prBody} onChange={(v) => set("prBody", v)} placeholder={t("editor.bodyPlaceholder")} />
              </label>
            </div>
          )}
        </div>

        <div style={s.right}>
          <div style={s.label}>{t("editor.expectations")}</div>
          <div style={s.muted}>{t("editor.expectationsHint")}</div>
          {draft.expectations.map((e, i) => (
            <fieldset key={i} style={s.exp} aria-label={`${t("editor.expectations")} ${i + 1}`}>
              <div style={s.expRow}>
                <SelectInput
                  value={e.type}
                  onChange={(v) => setExp(i, { type: v as ExpectationDraft["type"] })}
                  options={[
                    { value: "must_find", label: t("editor.mustFind") },
                    { value: "must_not_flag", label: t("editor.mustNotFlag") },
                  ]}
                />
                <IconBtn
                  icon="Trash"
                  danger
                  label={t("editor.removeExpectation", { n: i + 1 })}
                  onClick={() => set("expectations", draft.expectations.filter((_, j) => j !== i))}
                />
              </div>
              <label style={s.small}>
                {t("editor.file")}
                <TextInput mono value={e.file} onChange={(v) => setExp(i, { file: v })} />
              </label>
              <div style={s.expRow}>
                <label style={s.small}>
                  {t("editor.startLine")}
                  <TextInput mono value={e.start} onChange={(v) => setExp(i, { start: v })} />
                </label>
                <label style={s.small}>
                  {t("editor.endLine")}
                  <TextInput mono value={e.end} onChange={(v) => setExp(i, { end: v })} />
                </label>
              </div>
              <div style={s.expRow}>
                <label style={s.small}>
                  {t("editor.severity")}
                  <TextInput value={e.severity} onChange={(v) => setExp(i, { severity: v })} placeholder="CRITICAL" />
                </label>
                <label style={s.small}>
                  {t("editor.category")}
                  <TextInput value={e.category} onChange={(v) => setExp(i, { category: v })} placeholder="security" />
                </label>
              </div>
              <label style={s.small}>
                {t("editor.titleOptional")}
                <TextInput value={e.title} onChange={(v) => setExp(i, { title: v })} />
              </label>
            </fieldset>
          ))}
          <div>
            <Button
              kind="ghost"
              size="sm"
              icon="Plus"
              onClick={() => set("expectations", [...draft.expectations, newExpectation(draft.diff)])}
            >
              {t("editor.addExpectation")}
            </Button>
          </div>
          <LastRun existing={existing ?? null} run={run.data ?? null} />
          {error && (
            <div role="alert" style={s.error}>
              {error}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function LastRun({
  existing,
  run,
}: {
  existing: EvalCaseDetail | null;
  run: ReturnType<typeof useEvalRun>["data"] | null;
}) {
  const t = useTranslations("eval");
  if (run?.status === "running") return <div style={s.result("var(--accent)")}>{t("cases.running")}</div>;
  const fromRun = run?.results[0];
  const last = fromRun
    ? {
        status: fromRun.status,
        expected: fromRun.expected.expectations.filter((e) => e.type === "must_find").length,
        got: fromRun.kept.length,
        ms: fromRun.duration_ms,
        cost: fromRun.cost_usd,
      }
    : existing?.last_result
      ? {
          status: existing.last_result.status,
          expected: existing.last_result.expected_findings,
          got: existing.last_result.got_findings,
          ms: existing.last_result.duration_ms,
          cost: existing.last_result.cost_usd,
        }
      : null;
  if (!last) return null;
  const head =
    last.status === "pass"
      ? t("editor.lastRunPassed")
      : last.status === "error"
        ? t("editor.lastRunErrored")
        : t("editor.lastRunFailed");
  const color = last.status === "pass" ? "var(--ok)" : last.status === "error" ? "var(--warn)" : "var(--crit)";
  return (
    <div style={s.result(color)} data-last-run={last.status}>
      <strong>{head}</strong>
      {" · "}
      {t("editor.lastRunSummary", {
        summary: t("cases.expectedGot", { expected: last.expected, got: last.got }),
        seconds: ((last.ms ?? 0) / 1000).toFixed(1),
        cost: money(last.cost),
      })}
    </div>
  );
}
