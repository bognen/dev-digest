import { describe, it, expect } from 'vitest';
import {
  buildAgentStats,
  buildPerformance,
  daySeries,
  toPerfRow,
} from '../src/modules/agent-stats/helpers.js';
import type { AgentRunFacts } from '../src/modules/agent-stats/types.js';

const range = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-04T00:00:00Z') };
const A = { id: 'a', name: 'Alpha' };
const B = { id: 'b', name: 'Beta' };
const C = { id: 'c', name: 'Gamma' };

function facts(agentId: string, model: string | null, o: Partial<AgentRunFacts> = {}): AgentRunFacts {
  return {
    agentId,
    model,
    runs: 2,
    pricedRuns: 2,
    costSum: 0.1,
    durationRuns: 2,
    durationSum: 4000,
    lastRunAt: new Date('2026-10-02T10:00:00Z'),
    ...o,
  };
}

const decision = (agentId: string, accepted: number, dismissed: number, total = accepted + dismissed) => ({
  agentId,
  total,
  accepted,
  dismissed,
  critical: 1,
  warning: total - 1,
  suggestion: 0,
});

describe('toPerfRow', () => {
  it('merges model groups into one row with averages over priced/timed runs only', () => {
    const row = toPerfRow(
      A,
      [
        facts('a', 'gpt-4.1', { runs: 3, pricedRuns: 2, costSum: 0.3, durationRuns: 3, durationSum: 9000 }),
        facts('a', 'gpt-4o', { runs: 1, pricedRuns: 1, costSum: 0.1, durationRuns: 0, durationSum: 0, lastRunAt: new Date('2026-10-03T00:00:00Z') }),
      ],
      decision('a', 6, 4),
      10,
    );
    expect(row).toMatchObject({
      runs: 4,
      priced_runs: 3,
      unpriced_runs: 1,
      total_cost_usd: 0.4,
      avg_duration_ms: 3000,
      accepted: 6,
      dismissed: 4,
      decided: 10,
      accept_rate: 0.6,
      low_sample: false,
      last_run_at: '2026-10-03T00:00:00.000Z',
    });
    expect(row.avg_cost_usd).toBeCloseTo(0.4 / 3, 12);
    expect(row.cost_by_model.map((m) => m.model)).toEqual(['gpt-4.1', 'gpt-4o']);
  });

  it('reports an agent without runs as zeros and nulls, flagged low-sample', () => {
    expect(toPerfRow(A, [], undefined, 10)).toMatchObject({
      runs: 0,
      total_cost_usd: 0,
      avg_cost_usd: null,
      avg_duration_ms: null,
      decided: 0,
      accept_rate: null,
      low_sample: true,
      last_run_at: null,
      cost_by_model: [],
    });
  });

  it('flags a rate below the decision threshold as low-sample but still reports it', () => {
    const row = toPerfRow(A, [facts('a', 'm')], decision('a', 3, 1), 10);
    expect(row).toMatchObject({ accept_rate: 0.75, decided: 4, low_sample: true });
  });
});

describe('daySeries', () => {
  it('emits every UTC day of the half-open range, filling gaps with zero', () => {
    expect(daySeries(range, [{ day: '2026-10-02', runs: 3 }])).toEqual([
      { label: '2026-10-01', value: 0 },
      { label: '2026-10-02', value: 3 },
      { label: '2026-10-03', value: 0 },
    ]);
  });

  it('covers the partial days of a rolling 24h window', () => {
    const r = { from: new Date('2026-10-01T12:00:00Z'), to: new Date('2026-10-02T12:00:00Z') };
    expect(daySeries(r, []).map((p) => p.label)).toEqual(['2026-10-01', '2026-10-02']);
  });
});

describe('buildPerformance', () => {
  const runs = [
    facts('a', 'gpt-4.1', { runs: 5, pricedRuns: 5, costSum: 0.1 }),
    facts('a', 'gpt-4o', { runs: 1, pricedRuns: 1, costSum: 0.2 }),
    facts('b', 'gpt-4.1', { runs: 5, pricedRuns: 4, costSum: 0.7 }),
  ];
  const perf = buildPerformance(range, [A, B, C], runs, [decision('a', 9, 1), decision('b', 1, 1)], [], 10);

  it('keeps agents with no runs in the table but out of the cost breakdown', () => {
    expect(perf.agents.map((r) => r.agent_id)).toEqual(['a', 'b', 'c']);
    expect(perf.agents[2]!.runs).toBe(0);
    expect(perf.cost_by_agent.map((c) => c.agent_id)).toEqual(['b', 'a']);
  });

  it('reconciles total cost exactly with the per-agent and per-model breakdowns', () => {
    const micro = (n: number) => Math.round(n * 1e6);
    const total = micro(perf.totals.total_cost_usd);
    expect(total).toBe(micro(1.0));
    expect(perf.cost_by_agent.reduce((n, c) => n + micro(c.cost_usd), 0)).toBe(total);
    expect(perf.cost_by_model.reduce((n, c) => n + micro(c.cost_usd), 0)).toBe(total);
    expect(perf.cost_by_model.find((m) => m.model === 'gpt-4.1')).toEqual({ model: 'gpt-4.1', runs: 10, cost_usd: 0.8 });
  });

  it('sums runs and pools the accept rate with its denominator', () => {
    expect(perf.totals).toMatchObject({ runs: 11, priced_runs: 10, unpriced_runs: 1, accepted: 10, decided: 12 });
    expect(perf.totals.accept_rate).toBeCloseTo(10 / 12, 12);
  });

  it('picks the most-active agent by run count, breaking ties by name', () => {
    expect(perf.most_active).toMatchObject({ agent_id: 'a', runs: 6, decided: 10 });
    const tie = buildPerformance(range, [B, A], [facts('b', 'm'), facts('a', 'm')], [], [], 10);
    expect(tie.most_active?.agent_name).toBe('Alpha');
  });

  it('has no most-active agent and zero totals when nothing ran', () => {
    const empty = buildPerformance(range, [A], [], [], [], 10);
    expect(empty.most_active).toBeNull();
    expect(empty.totals).toMatchObject({ runs: 0, total_cost_usd: 0, accept_rate: null });
    expect(empty.cost_basis).toBe('estimate');
  });

  it('gives each agent the same row the per-agent Stats endpoint builds', () => {
    const stats = buildAgentStats(range, A, runs.slice(0, 2), decision('a', 9, 1), [], 10);
    const { range: _r, min_decisions: _m, cost_basis: _c, findings_total, pending, findings_by_severity: _s, trend: _t, ...row } = stats;
    expect(row).toEqual(perf.agents[0]);
    expect({ findings_total, pending }).toEqual({ findings_total: 10, pending: 0 });
  });
});
