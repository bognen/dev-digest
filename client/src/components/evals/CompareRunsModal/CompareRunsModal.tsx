/* CompareRunsModal — two full runs side by side (old → new by start time):
   metric + cost deltas (AC-29), system-prompt line diff and config changes
   (AC-30), per-case outcome flips (AC-31), case-set notice (AC-32), a sampling
   noise hint (AC-65) and "Promote vN" for agent runs (AC-34). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ConfirmDialog, Icon, Modal } from "@devdigest/ui";
import type { EvalSuiteRunDetail } from "@devdigest/shared";
import { useEvalRun, usePromoteEvalRun } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";
import {
  caseFlips,
  caseSetDiff,
  configChanges,
  costDeltaLabel,
  deltaLabel,
  deltaPts,
  lineDiff,
  metricText,
  orderRuns,
  type MetricKey,
} from "@/lib/eval-format";
import { useEscapeKey } from "../useEscapeKey";
import { s } from "./styles";

const METRICS: { key: MetricKey; label: "recall" | "precision" | "citationShort"; color: string }[] = [
  { key: "recall", label: "recall", color: "var(--accent)" },
  { key: "precision", label: "precision", color: "var(--ok)" },
  { key: "citation_accuracy", label: "citationShort", color: "var(--warn)" },
];

export function CompareRunsModal({ runIds, onClose }: { runIds: [string, string]; onClose: () => void }) {
  const t = useTranslations("eval");
  const a = useEvalRun(runIds[0]);
  const b = useEvalRun(runIds[1]);
  const [promoteTarget, setPromoteTarget] = React.useState<EvalSuiteRunDetail | null>(null);
  useEscapeKey(onClose, !promoteTarget);

  const loaded = a.data && b.data;
  const [oldRun, newRun] = loaded ? orderRuns(a.data!, b.data!) : [null, null];

  return (
    <>
      <Modal
        width={980}
        title={
          oldRun && newRun
            ? t("compare.title", { from: oldRun.agent_version, to: newRun.agent_version })
            : t("compare.loading")
        }
        subtitle={t("compare.subtitle")}
        onClose={onClose}
        footer={
          <div style={s.footer}>
            <Button kind="secondary" onClick={onClose}>
              {t("compare.close")}
            </Button>
            {newRun && newRun.owner_kind === "agent" && (
              <Button kind="primary" icon="GitBranch" onClick={() => setPromoteTarget(newRun)}>
                {t("compare.promote", { version: newRun.agent_version })}
              </Button>
            )}
            {oldRun && oldRun.owner_kind === "agent" && (
              <Button kind="ghost" onClick={() => setPromoteTarget(oldRun)}>
                {t("compare.promote", { version: oldRun.agent_version })}
              </Button>
            )}
          </div>
        }
      >
        {!oldRun || !newRun ? (
          <div style={s.loading}>{t("compare.loading")}</div>
        ) : (
          <CompareBody oldRun={oldRun} newRun={newRun} />
        )}
      </Modal>
      {promoteTarget && (
        <PromoteConfirm target={promoteTarget} onDone={() => setPromoteTarget(null)} onClose={onClose} />
      )}
    </>
  );
}

function CompareBody({ oldRun, newRun }: { oldRun: EvalSuiteRunDetail; newRun: EvalSuiteRunDetail }) {
  const t = useTranslations("eval");
  const prompt = lineDiff(oldRun.config.system_prompt, newRun.config.system_prompt);
  const promptChanged = prompt.some((l) => l.kind !== "same");
  const changes = configChanges(oldRun.config, newRun.config);
  const flips = caseFlips(oldRun.results, newRun.results);
  const sets = caseSetDiff(oldRun.case_ids, newRun.case_ids);
  const cost = costDeltaLabel(oldRun.cost_usd, newRun.cost_usd);

  return (
    <div style={s.body}>
      <div style={s.cards}>
        {METRICS.map((m) => {
          const pts = deltaPts(oldRun[m.key], newRun[m.key]);
          return (
            <div key={m.key} style={s.card} data-metric={m.key}>
              <div style={s.cardLabel}>{t(`metrics.${m.label}`)}</div>
              <div style={s.cardValues}>
                <span style={s.oldValue}>{metricText(oldRun, m.key)}</span>
                <Icon.ArrowRight size={14} style={s.arrow} />
                <span style={{ ...s.newValue, color: m.color }}>{metricText(newRun, m.key)}</span>
                <span style={s.delta(pts)}>{deltaLabel(pts)}</span>
              </div>
            </div>
          );
        })}
        <div style={s.card} data-metric="cost">
          <div style={s.cardLabel}>{t("metrics.cost")}</div>
          <div style={s.cardValues}>
            <span style={s.oldValue}>{oldRun.cost_usd == null ? "—" : oldRun.cost_usd.toFixed(2)}</span>
            <Icon.ArrowRight size={14} style={s.arrow} />
            <span style={s.newValue}>{newRun.cost_usd == null ? "—" : newRun.cost_usd.toFixed(2)}</span>
            {cost && <span style={s.costDelta}>{cost}</span>}
          </div>
        </div>
      </div>

      {(sets.added > 0 || sets.removed > 0) && (
        <div role="note" style={s.notice}>
          <Icon.Info size={14} /> {t("compare.caseSetsDiffer", sets)}
        </div>
      )}

      <section>
        <div style={s.sectionTitle}>
          <Icon.FileText size={14} /> {t("compare.promptDiff")}
        </div>
        <div style={s.legend}>
          <span style={s.legendItem}>
            <span style={s.swatch("var(--crit-bg)")} /> {t("compare.legendOld", { version: oldRun.agent_version })}
          </span>
          <span style={s.legendItem}>
            <span style={s.swatch("var(--ok-bg)")} /> {t("compare.legendNew", { version: newRun.agent_version })}
          </span>
        </div>
        {promptChanged ? (
          <pre style={s.prompt} aria-label={t("compare.promptDiff")}>
            {prompt.map((l, i) => (
              <div key={i} style={s.promptLine(l.kind)} data-diff={l.kind}>
                {l.kind === "added" ? "+ " : l.kind === "removed" ? "- " : "  "}
                {l.text}
              </div>
            ))}
          </pre>
        ) : (
          <div style={s.muted}>{t("compare.noPromptChange")}</div>
        )}
      </section>

      {changes.length > 0 && (
        <section>
          <div style={s.sectionTitle}>{t("compare.configChanges")}</div>
          <ul style={s.list}>
            {changes.map((c) => (
              <li key={c} style={s.mono}>
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div style={s.sectionTitle}>{t("compare.caseChanges")}</div>
        {flips.length === 0 ? (
          <div style={s.muted}>{t("compare.noCaseChanges")}</div>
        ) : (
          <ul style={s.list}>
            {flips.map((f) => (
              <li key={f.name} style={s.mono} data-flip={f.name}>
                {f.name}: {f.from} → {f.to}
              </li>
            ))}
          </ul>
        )}
        <div style={s.hint}>{t("compare.noiseHint")}</div>
      </section>
    </div>
  );
}

function PromoteConfirm({
  target,
  onDone,
  onClose,
}: {
  target: EvalSuiteRunDetail;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const promote = usePromoteEvalRun();

  return (
    <ConfirmDialog
      title={t("compare.promoteTitle", { version: target.agent_version })}
      message={t("compare.promoteBody", { version: target.agent_version })}
      confirmLabel={t("compare.promoteConfirm")}
      cancelLabel={t("compare.close")}
      loading={promote.isPending}
      onCancel={onDone}
      onConfirm={() =>
        promote.mutate(target.id, {
          onSuccess: (res) => {
            notify.success(
              res.skipped_skills.length
                ? t("compare.promotedSkipped", { version: res.agent_version, skills: res.skipped_skills.join(", ") })
                : t("compare.promoted", { version: res.agent_version }),
            );
            onDone();
            onClose();
          },
          onError: (err) => {
            notify.error((err as Error).message);
            onDone();
          },
        })
      }
    />
  );
}
