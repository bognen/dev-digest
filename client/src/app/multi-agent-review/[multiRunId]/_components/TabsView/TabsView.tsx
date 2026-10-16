/* TabsView — one tab per child run plus the selected agent's header and its
   findings as full FindingCards (design: screen_multiagent.jsx TabsView). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, CircularScore, Icon, MonoLink } from "@devdigest/ui";
import type { MultiRunChild } from "@devdigest/shared";
import { FindingCard } from "@/components/review/FindingCard";
import { agentColor } from "@/lib/agent-color";
import { formatCost, formatSeconds } from "@/lib/format";
import { useFindingAction } from "@/lib/hooks/reviews";
import { scoreColor, statusColor, VISUALLY_HIDDEN } from "@/lib/multi-run";
import { s } from "./styles";

export function TabsView({
  runs,
  prId,
  onViewTrace,
}: {
  runs: MultiRunChild[];
  prId: string;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent");
  const action = useFindingAction();
  // Remember the selection by run id; fall back to the first tab (derived, no effect).
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const run = runs.find((r) => r.run_id === selectedId) ?? runs[0]!;
  const color = agentColor(run.agent_id);
  const name = run.agent_name ?? t("results.deletedAgent");
  const done = run.status === "done";

  return (
    <div>
      <div role="tablist" aria-label={t("results.tabs.label")} style={s.strip}>
        {runs.map((r) => {
          const on = r.run_id === run.run_id;
          const c = agentColor(r.agent_id);
          return (
            <button
              key={r.run_id}
              type="button"
              role="tab"
              id={`tab-${r.run_id}`}
              aria-selected={on}
              aria-controls={`panel-${r.run_id}`}
              onClick={() => setSelectedId(r.run_id)}
              style={s.tab(on, c)}
            >
              <Icon.Cpu size={15} style={{ color: on ? c : "var(--text-muted)" }} />
              <span style={s.tabName(on)}>{r.agent_name ?? t("results.deletedAgent")}</span>
              {r.status === "done" && r.score != null ? (
                <span className="tnum" style={s.tabScore(scoreColor(r.score))}>
                  {r.score}
                </span>
              ) : (
                <span style={s.tabStatus(statusColor(r.status))}>{t(`results.status.${r.status}`)}</span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${run.run_id}`} aria-labelledby={`tab-${run.run_id}`} style={s.panel}>
        <div style={s.agentCard(color)}>
          {done && run.score != null ? (
            <CircularScore score={run.score} size={44} />
          ) : done ? (
            <span style={s.noScore}>—</span>
          ) : (
            <Badge dot bg="transparent" color={statusColor(run.status)}>
              {t(`results.status.${run.status}`)}
            </Badge>
          )}
          <div>
            <div style={s.agentName(color)}>{name}</div>
            <p style={s.summary}>{run.summary ?? t("results.tabs.noSummary")}</p>
          </div>
          <div style={s.agentRight}>
            <MonoLink onClick={() => onViewTrace(run.run_id)}>
              {t("results.column.viewTrace")}
              <span style={VISUALLY_HIDDEN}> {t("results.column.viewTraceFor", { name })}</span>
            </MonoLink>
            {done && (
              <span className="mono tnum" style={s.meta}>
                {formatSeconds(run.duration_ms)} · {formatCost(run.cost_usd, 2)}
              </span>
            )}
          </div>
        </div>

        {run.status === "failed" && (
          <p style={s.error}>
            {run.error
              ? t("results.column.failedReason", { error: run.error })
              : t("results.column.failedNoReason")}
          </p>
        )}
        <div style={s.findings}>
          {run.findings.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              defaultExpanded={i === 0}
              pending={action.isPending}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
              extraActions={
                <Button
                  kind="ghost"
                  size="sm"
                  icon="Brain"
                  disabled
                  aria-disabled="true"
                  title={t("results.tabs.learnUnavailable")}
                >
                  {t("results.tabs.learn")}
                </Button>
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
