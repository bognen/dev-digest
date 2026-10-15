/* ColumnsView — one column per child run (design: screen_multiagent.jsx
   ColumnsView). Header (live status until done, then score + time · cost),
   finding rows, and a footer with "View trace" and the finding count. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, CircularScore, Icon, MonoLink, SEV, type Severity } from "@devdigest/ui";
import type { MultiRunChild } from "@devdigest/shared";
import { agentColor } from "@/lib/agent-color";
import { formatCost, formatSeconds } from "@/lib/format";
import { useCancelRun } from "@/lib/hooks/reviews";
import { isActiveStatus, statusColor, VISUALLY_HIDDEN } from "@/lib/multi-run";
import { COLUMN_GAP } from "./constants";
import { columnsTemplate, scrolls } from "./helpers";
import { s } from "./styles";

function FindingMini({ f }: { f: MultiRunChild["findings"][number] }) {
  const sev = SEV[f.severity as Severity] ?? SEV.INFO;
  const Glyph = Icon[sev.icon];
  return (
    <li style={s.mini(sev.c)}>
      <div style={s.miniTop}>
        <span role="img" aria-label={sev.label} style={{ display: "inline-flex" }}>
          <Glyph size={12} style={{ color: sev.c, flexShrink: 0 }} />
        </span>
        <span style={s.miniTitle}>{f.title}</span>
      </div>
      <div className="mono" style={s.miniFile}>
        {f.file}:{f.start_line}
      </div>
    </li>
  );
}

function AgentColumn({
  run,
  onViewTrace,
}: {
  run: MultiRunChild;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent");
  const cancel = useCancelRun();
  const color = agentColor(run.agent_id);
  const name = run.agent_name ?? t("results.deletedAgent");
  const done = run.status === "done";
  const active = isActiveStatus(run.status);
  const cancelling = cancel.isPending && cancel.variables === run.run_id;

  return (
    <section aria-label={name} style={s.column}>
      <div style={s.header(color)}>
        <div style={s.headerRow}>
          <div aria-hidden style={s.tile(color)}>
            <Icon.Cpu size={16} />
          </div>
          <div style={s.headerText}>
            <div style={s.name}>{name}</div>
            {done && (
              <div className="mono tnum" style={s.meta}>
                {formatSeconds(run.duration_ms)} · {formatCost(run.cost_usd, 2)}
              </div>
            )}
          </div>
          {done ? (
            run.score != null ? (
              <span aria-label={t("results.column.score", { score: run.score })}>
                <CircularScore score={run.score} size={32} stroke={3.5} />
              </span>
            ) : (
              <span style={s.noScore}>—</span>
            )
          ) : (
            <Badge dot bg="transparent" color={statusColor(run.status)}>
              {t(`results.status.${run.status}`)}
            </Badge>
          )}
        </div>
      </div>

      <div style={s.body}>
        {run.status === "failed" ? (
          <p style={s.error}>
            {run.error
              ? t("results.column.failedReason", { error: run.error })
              : t("results.column.failedNoReason")}
          </p>
        ) : run.findings.length > 0 ? (
          <ul style={s.list}>
            {run.findings.map((f) => (
              <FindingMini key={f.id} f={f} />
            ))}
          </ul>
        ) : done ? (
          <p style={s.muted}>{t("results.column.noFindings")}</p>
        ) : null}
      </div>

      <div style={s.footer}>
        <MonoLink onClick={() => onViewTrace(run.run_id)}>
          {t("results.column.viewTrace")}
          <span style={VISUALLY_HIDDEN}> {t("results.column.viewTraceFor", { name })}</span>
        </MonoLink>
        <div style={s.footerRight}>
          {active && (
            <Button
              kind="ghost"
              size="sm"
              loading={cancelling}
              aria-label={t("results.column.cancelFor", { name })}
              onClick={() => cancel.mutate(run.run_id)}
            >
              {t("results.column.cancel")}
            </Button>
          )}
          <span style={s.count}>{t("results.column.findings", { count: run.findings.length })}</span>
        </div>
      </div>
    </section>
  );
}

export function ColumnsView({
  runs,
  onViewTrace,
}: {
  runs: MultiRunChild[];
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent");
  const scroll = scrolls(runs.length);
  return (
    <div style={s.root}>
      <div
        style={s.grid(columnsTemplate(runs.length), scroll, COLUMN_GAP)}
        {...(scroll ? { tabIndex: 0, role: "region", "aria-label": t("results.viewColumns") } : {})}
      >
        {runs.map((run) => (
          <AgentColumn key={run.run_id} run={run} onViewTrace={onViewTrace} />
        ))}
      </div>
    </div>
  );
}
