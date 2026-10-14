/* Skill editor "Evals" tab (SPEC-06 AC-51/52/63): the shared EvalsPanel scoped
   to this skill, plus the host-agent picker. Skill evals run on the host agent's
   prompt/model with only this skill attached; the default host is the first
   enabled agent linking the skill. With no host available, running is disabled. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SelectInput } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { EvalsPanel } from "@/components/evals/EvalsPanel";
import { useAgents } from "@/lib/hooks/agents";
import { useSkillStats } from "@/lib/hooks/skills";
import { AUTO_HOST } from "./constants";
import { s } from "./styles";

export function SkillEvalsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("eval");
  const agents = useAgents();
  const stats = useSkillStats(skill.id);
  const [host, setHost] = React.useState<string>(AUTO_HOST);

  const linkedCount = stats.data?.agents_using.length ?? 0;
  const blocked = host === AUTO_HOST && stats.isSuccess && linkedCount === 0 ? t("skill.pickHost") : null;

  return (
    <div style={s.wrap}>
      <label style={s.host}>
        <span style={s.hostLabel}>{t("skill.host")}</span>
        <SelectInput
          value={host}
          onChange={setHost}
          options={[
            { value: AUTO_HOST, label: t("skill.hostDefault") },
            ...(agents.data ?? []).map((a) => ({ value: a.id, label: `${a.name} · ${a.model}` })),
          ]}
        />
        <span style={s.hint}>{t("skill.hostHint")}</span>
      </label>
      <EvalsPanel
        key={skill.id}
        ownerKind="skill"
        ownerId={skill.id}
        ownerName={skill.name}
        {...(host !== AUTO_HOST ? { hostAgentId: host } : {})}
        runBlockedReason={blocked}
      />
    </div>
  );
}
