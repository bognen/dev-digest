/* RunReviewDropdown — the PR-page "Run Review" picker (design: components2.jsx).
   Every enabled agent is preselected; "Run multi-agent review (N)" creates a
   multi-run (POST /pulls/:id/multi-agent-runs) and opens its results page. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, type DropdownItemDef } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEstimates, useCreateMultiRun } from "@/lib/hooks/multi-agent";
import { notify } from "@/lib/toast";
import { AGENTS_HREF, DROPDOWN_WIDTH } from "./constants";
import { AgentSelectList, type AgentSelectLabels } from "./AgentSelectList";
import { s } from "./styles";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents } = useAgents();
  const { data: estimates } = useAgentEstimates();
  const create = useCreateMultiRun();
  const enabled = React.useMemo(() => (agents ?? []).filter((a) => a.enabled), [agents]);
  // Excluded ids (not selected ids): every enabled agent starts preselected
  // without an effect, and agents enabled later are preselected too.
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());

  const selected = enabled.filter((a) => !excluded.has(a.id));
  const allSelected = enabled.length > 0 && selected.length === enabled.length;
  const multi = selected.length > 1;

  const estimateMsFor = (agentId: string) =>
    estimates?.estimates.find((e) => e.agent_id === agentId)?.duration_ms ?? null;

  const toggle = (agentId: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  const toggleAll = () =>
    setExcluded(allSelected ? new Set(enabled.map((a) => a.id)) : new Set());

  const run = async () => {
    const agentIds = selected.map((a) => a.id);
    if (agentIds.length === 0 || create.isPending) return;
    onRunStart?.();
    try {
      const res = await create.mutateAsync({ prId, agent_ids: agentIds });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
      router.push(`/multi-agent-review/${res.multi_run_id}`);
    } catch {
      notify.error(t("runReview.startFailed"));
    } finally {
      onRunSettled?.();
    }
  };

  const runLabel =
    selected.length === 0
      ? t("runReview.selectAgent")
      : multi
        ? t("runReview.runMulti", { count: selected.length })
        : t("runReview.runOne", { name: selected[0]!.name });

  const labels: AgentSelectLabels = {
    warning: warnMerged ? t("runReview.mergedWarning") : null,
    header: t("runReview.pickAgents"),
    selectAll: t("runReview.selectAll"),
    clearAll: t("runReview.clearAll"),
    run: runLabel,
    configure: t("runReview.configureAgents"),
    noAgents: t("runReview.noAgents"),
    checkboxName: (name) => t("runReview.agentCheckbox", { name }),
  };

  const items: DropdownItemDef[] = [
    {
      custom: (close) => (
        <AgentSelectList
          agents={enabled}
          excluded={excluded}
          allSelected={allSelected}
          estimateMsFor={estimateMsFor}
          labels={labels}
          multi={multi}
          running={create.isPending}
          disabled={selected.length === 0}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onRun={() => {
            close();
            void run();
          }}
          onConfigure={() => {
            close();
            router.push(AGENTS_HREF);
          }}
        />
      ),
    },
  ];

  return (
    <Dropdown
      width={DROPDOWN_WIDTH}
      align="right"
      items={items}
      trigger={
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={warnMerged ? s.triggerMerged : undefined}
        >
          <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={create.isPending}>
            {create.isPending ? t("runReview.running") : t("runReview.runReview")}
          </Button>
        </span>
      }
    />
  );
}
