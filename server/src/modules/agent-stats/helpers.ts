import type { AgentPerformance, AgentPerfRow, AgentStats, ModelCost, SkillCost, StatPoint } from '@devdigest/shared';
import { COST_BASIS } from './constants.js';
import type {
  AgentDecisionFacts,
  AgentRef,
  AgentRunFacts,
  DayRunFacts,
  RangeBounds,
  SkillRunFacts,
} from './types.js';

/**
 * Pure aggregation for the agent stats module. The dashboard and the Stats tab
 * both build their per-agent numbers with `toPerfRow`, and the dashboard totals
 * are sums of those rows — so they reconcile by construction.
 *
 * Money is summed in integer micro-dollars and only converted back at the edge,
 * so `total == Σ by agent == Σ by model` holds exactly (no float drift).
 */

const MICRO = 1_000_000;
const DAY_MS = 86_400_000;

const toMicro = (usd: number): number => Math.round(usd * MICRO);
const fromMicro = (micro: number): number => micro / MICRO;

/** Rows → per-model costs (micro-dollars), merged by model, most expensive first. */
function mergeModelCosts(groups: Array<{ model: string | null; runs: number; micro: number }>): ModelCost[] {
  const byModel = new Map<string | null, { runs: number; micro: number }>();
  for (const g of groups) {
    const acc = byModel.get(g.model) ?? { runs: 0, micro: 0 };
    acc.runs += g.runs;
    acc.micro += g.micro;
    byModel.set(g.model, acc);
  }
  return [...byModel.entries()]
    .map(([model, v]) => ({ model, runs: v.runs, micro: v.micro }))
    .sort((a, b) => b.micro - a.micro || b.runs - a.runs || String(a.model).localeCompare(String(b.model)))
    .map(({ model, runs, micro }) => ({ model, runs, cost_usd: fromMicro(micro) }));
}

/** Per-skill costs (overlapping), most expensive first; the "no skill" bucket last. */
function toSkillCosts(skills: SkillRunFacts[]): SkillCost[] {
  return skills
    .map((k) => ({ skill_id: k.skillId, skill_name: k.skillName, runs: k.runs, micro: toMicro(k.costSum) }))
    .sort(
      (a, b) =>
        Number(a.skill_id === null) - Number(b.skill_id === null) ||
        b.micro - a.micro ||
        b.runs - a.runs ||
        String(a.skill_name).localeCompare(String(b.skill_name)),
    )
    .map(({ micro, ...k }) => ({ ...k, cost_usd: fromMicro(micro) }));
}

/** One agent's row: runs, cost, duration, accept-rate (with its denominator), last run. */
export function toPerfRow(
  agent: AgentRef,
  runs: AgentRunFacts[],
  decisions: AgentDecisionFacts | undefined,
  minDecisions: number,
  skills: SkillRunFacts[] = [],
): AgentPerfRow {
  let runCount = 0;
  let priced = 0;
  let micro = 0;
  let durRuns = 0;
  let durSum = 0;
  let last: Date | null = null;
  for (const r of runs) {
    runCount += r.runs;
    priced += r.pricedRuns;
    micro += toMicro(r.costSum);
    durRuns += r.durationRuns;
    durSum += r.durationSum;
    if (!last || r.lastRunAt > last) last = r.lastRunAt;
  }
  const accepted = decisions?.accepted ?? 0;
  const dismissed = decisions?.dismissed ?? 0;
  const decided = accepted + dismissed;
  return {
    agent_id: agent.id,
    agent_name: agent.name,
    runs: runCount,
    priced_runs: priced,
    unpriced_runs: runCount - priced,
    total_cost_usd: fromMicro(micro),
    avg_cost_usd: priced > 0 ? fromMicro(micro) / priced : null,
    avg_duration_ms: durRuns > 0 ? durSum / durRuns : null,
    accepted,
    dismissed,
    decided,
    accept_rate: decided > 0 ? accepted / decided : null,
    low_sample: decided < minDecisions,
    last_run_at: last ? last.toISOString() : null,
    cost_by_model: mergeModelCosts(runs.map((r) => ({ model: r.model, runs: r.runs, micro: toMicro(r.costSum) }))),
    cost_by_skill: toSkillCosts(skills),
  };
}

/** Every UTC day the range touches, oldest→newest, with its run count (gap days = 0). */
export function daySeries(range: RangeBounds, days: Array<Pick<DayRunFacts, 'day' | 'runs'>>): StatPoint[] {
  const counts = new Map<string, number>();
  for (const d of days) counts.set(d.day, (counts.get(d.day) ?? 0) + d.runs);
  const out: StatPoint[] = [];
  const start = Math.floor(range.from.getTime() / DAY_MS) * DAY_MS;
  const lastMs = range.to.getTime() - 1;
  for (let ms = start; ms <= lastMs; ms += DAY_MS) {
    const label = new Date(ms).toISOString().slice(0, 10);
    out.push({ label, value: counts.get(label) ?? 0 });
  }
  return out;
}

const rangeDto = (range: RangeBounds) => ({ from: range.from.toISOString(), to: range.to.toISOString() });

/** GET /agents/:id/stats — one agent's row plus findings detail and daily trend. */
export function buildAgentStats(
  range: RangeBounds,
  agent: AgentRef,
  runs: AgentRunFacts[],
  decisions: AgentDecisionFacts | undefined,
  days: DayRunFacts[],
  minDecisions: number,
  skills: SkillRunFacts[] = [],
): AgentStats {
  const row = toPerfRow(agent, runs, decisions, minDecisions, skills);
  const total = decisions?.total ?? 0;
  return {
    ...row,
    range: rangeDto(range),
    min_decisions: minDecisions,
    cost_basis: COST_BASIS,
    findings_total: total,
    pending: total - row.decided,
    findings_by_severity: {
      CRITICAL: decisions?.critical ?? 0,
      WARNING: decisions?.warning ?? 0,
      SUGGESTION: decisions?.suggestion ?? 0,
    },
    trend: daySeries(range, days),
  };
}

/** GET /agent-performance — every agent's row, totals and cost breakdowns. */
export function buildPerformance(
  range: RangeBounds,
  agents: AgentRef[],
  runs: AgentRunFacts[],
  decisions: AgentDecisionFacts[],
  days: DayRunFacts[],
  minDecisions: number,
  skills: SkillRunFacts[] = [],
): AgentPerformance {
  const decisionsBy = new Map(decisions.map((d) => [d.agentId, d]));
  const rows = agents.map((a) =>
    toPerfRow(
      a,
      runs.filter((r) => r.agentId === a.id),
      decisionsBy.get(a.id),
      minDecisions,
      skills.filter((k) => k.agentId === a.id),
    ),
  );

  const sum = (pick: (r: AgentPerfRow) => number) => rows.reduce((n, r) => n + pick(r), 0);
  const totalMicro = sum((r) => toMicro(r.total_cost_usd));
  const accepted = sum((r) => r.accepted);
  const decided = sum((r) => r.decided);

  const active = rows
    .filter((r) => r.runs > 0)
    .sort((a, b) => b.runs - a.runs || a.agent_name.localeCompare(b.agent_name))[0];

  return {
    range: rangeDto(range),
    min_decisions: minDecisions,
    cost_basis: COST_BASIS,
    agent_count: agents.length,
    totals: {
      runs: sum((r) => r.runs),
      priced_runs: sum((r) => r.priced_runs),
      unpriced_runs: sum((r) => r.unpriced_runs),
      total_cost_usd: fromMicro(totalMicro),
      accepted,
      decided,
      accept_rate: decided > 0 ? accepted / decided : null,
    },
    most_active: active
      ? {
          agent_id: active.agent_id,
          agent_name: active.agent_name,
          runs: active.runs,
          accept_rate: active.accept_rate,
          decided: active.decided,
        }
      : null,
    agents: rows,
    cost_by_agent: rows
      .filter((r) => r.runs > 0)
      .map((r) => ({ agent_id: r.agent_id, agent_name: r.agent_name, cost_usd: r.total_cost_usd }))
      .sort((a, b) => b.cost_usd - a.cost_usd || a.agent_name.localeCompare(b.agent_name)),
    cost_by_model: mergeModelCosts(
      runs.map((r) => ({ model: r.model, runs: r.runs, micro: toMicro(r.costSum) })),
    ),
    runs_by_day: daySeries(range, days),
  };
}
