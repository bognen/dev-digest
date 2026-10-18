/* CostBreakdown — the period's total cost split by agent and by model. Both
   donuts come from the same included runs as the Total cost tile, so each
   sums to that total (stated under the charts). */
import React from "react";
import { useTranslations } from "next-intl";
import { Card, Donut, SectionLabel } from "@devdigest/ui";
import type { AgentPerformance } from "@devdigest/shared";
import { CostBasisBadge } from "@/components/agent-stats/CostBasisBadge";
import { AGENT_PALETTE, AGENT_COLOR_NEUTRAL } from "@/lib/agent-color";
import { formatCost } from "@/lib/format";
import { DONUT_SIZE, DONUT_STROKE } from "./constants";
import { s } from "./styles";

const fmt = (v: number) => formatCost(v);

export function CostBreakdown({ data, colors }: { data: AgentPerformance; colors: ReadonlyMap<string, string> }) {
  const t = useTranslations("agentPerformance");
  const byAgent = data.cost_by_agent.map((c) => ({ label: c.agent_name, value: c.cost_usd, color: colors.get(c.agent_id) ?? AGENT_COLOR_NEUTRAL }));
  const byModel = data.cost_by_model.map((c, i) => ({
    label: c.model ?? t("table.detail.unknownModel"),
    value: c.cost_usd,
    color: AGENT_PALETTE[i % AGENT_PALETTE.length]!,
  }));
  const hasCost = data.totals.total_cost_usd > 0;

  return (
    <section aria-label={t("cost.title")}>
      <SectionLabel icon="DollarSign" right={<CostBasisBadge basis={data.cost_basis} />}>
        {t("cost.title")}
      </SectionLabel>
      {hasCost ? (
        <>
          <div style={s.grid}>
            <Card>
              <h3 style={s.h3}>{t("cost.byAgent")}</h3>
              <Donut segments={byAgent} size={DONUT_SIZE} stroke={DONUT_STROKE} formatValue={fmt} />
            </Card>
            <Card>
              <h3 style={s.h3}>{t("cost.byModel")}</h3>
              <Donut segments={byModel} size={DONUT_SIZE} stroke={DONUT_STROKE} formatValue={fmt} />
            </Card>
          </div>
          <p style={s.reconcile} data-testid="cost-reconcile">
            {t("cost.reconcile", { total: formatCost(data.totals.total_cost_usd) })}
          </p>
        </>
      ) : (
        <Card>
          <p style={s.empty}>{t("cost.noCost")}</p>
        </Card>
      )}
    </section>
  );
}
