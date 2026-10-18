/* AgentEditor — agent editor shell: Config (model + system prompt), Skills
   (link + order catalog skills), Context (attach repo docs), Evals (SPEC-06
   regression cases, metrics, history), Stats (runs/cost/accept rate for a
   range — same aggregation as Agent Performance) and CI tabs.
   Tab state lives in ?tab= (validated by the page against VALID_TABS). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
import { ContextTab } from "./_components/ContextTab";
import { CiTab } from "./_components/CiTab";
import { StatsTab } from "./_components/StatsTab";
import { EvalsPanel } from "@/components/evals/EvalsPanel";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "skills" ? (
          <SkillsTab key={agent.id} agent={agent} />
        ) : tab === "context" ? (
          <ContextTab key={agent.id} agent={agent} />
        ) : tab === "evals" ? (
          <EvalsPanel key={agent.id} ownerKind="agent" ownerId={agent.id} ownerName={agent.name} />
        ) : tab === "stats" ? (
          <StatsTab key={agent.id} agentId={agent.id} agentName={agent.name} />
        ) : tab === "ci" ? (
          <CiTab key={agent.id} agent={agent} />
        ) : (
          <ConfigTab agent={agent} />
        )}
      </div>
    </div>
  );
}
