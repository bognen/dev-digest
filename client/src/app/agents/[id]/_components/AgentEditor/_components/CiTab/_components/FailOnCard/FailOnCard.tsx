/* FailOnCard — "Fail CI on" segmented control. Same agent setting (`ci_fail_on`) as the Config tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { FAIL_ON_OPTIONS } from "../../constants";
import { s } from "../../styles";

export function FailOnCard({ agent }: { agent: Agent }) {
  const t = useTranslations("ci.ciTab.failOn");
  const update = useUpdateAgent();
  return (
    <div style={s.failCard}>
      <div style={s.failText}>
        <div id="ci-fail-on-title" style={s.failTitle}>
          {t("title")}
        </div>
        <div style={s.failHelp}>{t("desc")}</div>
      </div>
      <div role="radiogroup" aria-labelledby="ci-fail-on-title" style={s.segmented}>
        {FAIL_ON_OPTIONS.map((o) => {
          const active = agent.ci_fail_on === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={update.isPending}
              onClick={() => !active && update.mutate({ id: agent.id, patch: { ci_fail_on: o.value } })}
              style={s.segment(active, update.isPending)}
            >
              {t(o.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
