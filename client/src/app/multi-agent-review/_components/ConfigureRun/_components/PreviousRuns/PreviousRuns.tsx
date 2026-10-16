/* PreviousRuns — the active repo's earlier multi-agent reviews, newest first,
   below the Configure run form. Not in the design: it reuses the screen's
   card/meta styling. Each row opens that run's results page. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Skeleton } from "@devdigest/ui";
import type { MultiRunSummary } from "@devdigest/shared";
import { useMultiRuns } from "@/lib/hooks/multi-agent";
import { formatCost, formatSeconds, relativeTime } from "@/lib/format";
import { multiRunStatusColor } from "@/lib/multi-run";
import { s } from "./styles";

function RunRow({ run }: { run: MultiRunSummary }) {
  const t = useTranslations("multiAgent.history");
  const age = relativeTime(run.ran_at);
  const agents = run.agent_names.map((n) => n ?? t("deletedAgent")).join(", ");
  return (
    <li>
      <Link href={`/multi-agent-review/${encodeURIComponent(run.id)}`} style={s.row}>
        <div style={s.main}>
          <div style={s.titleRow}>
            <span style={s.pr}>{t("pr", { number: run.pr_number, title: run.pr_title })}</span>
            <Badge dot bg="transparent" color={multiRunStatusColor(run.status)}>
              {t(`status.${run.status}`)}
            </Badge>
          </div>
          <div style={s.agents} title={agents}>
            {t("agents", { count: run.agent_names.length })} · {agents}
          </div>
        </div>
        <div style={s.side}>
          <span style={s.findings}>{t("findings", { count: run.finding_count })}</span>
          <span className="mono tnum" style={s.meta}>
            {formatSeconds(run.total_duration_ms)} · {formatCost(run.total_cost_usd, 2)}
          </span>
          <time dateTime={run.ran_at} title={new Date(run.ran_at).toLocaleString()} style={s.meta}>
            {age === "now" ? t("justNow") : t("ranAt", { age })}
          </time>
        </div>
      </Link>
    </li>
  );
}

export function PreviousRuns({ repoId }: { repoId: string }) {
  const t = useTranslations("multiAgent.history");
  const q = useMultiRuns(repoId);
  const runs = q.data?.multi_runs ?? [];

  return (
    <section aria-labelledby="previous-runs-title" style={s.section}>
      <h2 id="previous-runs-title" style={s.h2}>
        {t("title")}
      </h2>
      {q.isLoading ? (
        <Skeleton height={56} />
      ) : q.isError ? (
        <p role="alert" style={s.error}>
          {t("loadFailed")}
        </p>
      ) : runs.length === 0 ? (
        <p style={s.empty}>{t("empty")}</p>
      ) : (
        <ul style={s.list}>
          {runs.map((r) => (
            <RunRow key={r.id} run={r} />
          ))}
        </ul>
      )}
    </section>
  );
}
