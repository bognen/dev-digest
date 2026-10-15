/* AgentSelectList — the "Pick agents to run" panel inside RunReviewDropdown
   (design: components2.jsx). Checkbox rows for every enabled agent, a
   full-width run button and a "Configure agents…" footer. */
"use client";

import React from "react";
import { Button, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { formatSeconds } from "@/lib/format";
import { s } from "./styles";

export interface AgentSelectLabels {
  warning: string | null;
  header: string;
  selectAll: string;
  clearAll: string;
  run: string;
  configure: string;
  noAgents: string;
  checkboxName: (name: string) => string;
}

function AgentRow({
  agent,
  on,
  estimateMs,
  ariaLabel,
  onToggle,
}: {
  agent: Agent;
  on: boolean;
  estimateMs: number | null;
  ariaLabel: string;
  onToggle: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={s.row(hover)}
    >
      <span aria-hidden style={s.box(on)}>
        {on && <Icon.Check size={11} style={s.check} />}
      </span>
      <Icon.Cpu size={14} style={s.rowIcon} />
      <span style={s.rowName}>{agent.name}</span>
      <span className="mono" style={s.rowEstimate}>
        {formatSeconds(estimateMs)}
      </span>
    </button>
  );
}

export function AgentSelectList({
  agents,
  excluded,
  allSelected,
  estimateMsFor,
  labels,
  multi,
  running,
  disabled,
  onToggle,
  onToggleAll,
  onRun,
  onConfigure,
}: {
  /** Enabled agents only. */
  agents: Agent[];
  excluded: Set<string>;
  allSelected: boolean;
  estimateMsFor: (agentId: string) => number | null;
  labels: AgentSelectLabels;
  multi: boolean;
  running: boolean;
  disabled: boolean;
  onToggle: (agentId: string) => void;
  onToggleAll: () => void;
  onRun: () => void;
  onConfigure: () => void;
}) {
  return (
    <div style={s.panel}>
      {labels.warning && (
        <div style={s.warnRow}>
          <Icon.AlertTriangle size={13} style={s.warnIcon} />
          <span>{labels.warning}</span>
        </div>
      )}
      <div style={s.header}>
        <span style={s.headerLabel}>{labels.header}</span>
        {agents.length > 0 && (
          <button type="button" onClick={onToggleAll} style={s.link}>
            {allSelected ? labels.clearAll : labels.selectAll}
          </button>
        )}
      </div>
      {agents.length === 0 ? (
        <button type="button" onClick={onConfigure} style={s.footer}>
          <Icon.Plus size={13} />
          {labels.noAgents}
        </button>
      ) : (
        agents.map((a) => (
          <AgentRow
            key={a.id}
            agent={a}
            on={!excluded.has(a.id)}
            estimateMs={estimateMsFor(a.id)}
            ariaLabel={labels.checkboxName(a.name)}
            onToggle={() => onToggle(a.id)}
          />
        ))
      )}
      <div style={s.runWrap}>
        <Button
          kind="primary"
          size="sm"
          icon={multi ? "Users" : "Play"}
          disabled={disabled}
          loading={running}
          onClick={onRun}
          style={s.runButton}
        >
          {labels.run}
        </Button>
      </div>
      <button type="button" onClick={onConfigure} style={s.footer}>
        <Icon.Settings size={13} />
        {labels.configure}
      </button>
    </div>
  );
}
