/* CostBasisBadge — says where a cost figure comes from: a DevDigest estimate
   (tokens × list price) or reconciled provider billing. Every cost surface on
   the Stats tab and the Agent Performance dashboard shows one. */
import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CostBasis } from "@devdigest/shared";

export function CostBasisBadge({ basis }: { basis: CostBasis }) {
  const t = useTranslations("agentPerformance");
  const estimate = basis === "estimate";
  return (
    <span title={t(estimate ? "costBasis.estimateHint" : "costBasis.reconciledHint")}>
      <Badge icon={estimate ? "Info" : "Check"} color={estimate ? "var(--warn)" : "var(--ok)"}>
        {t(estimate ? "costBasis.estimate" : "costBasis.reconciled")}
      </Badge>
    </span>
  );
}
