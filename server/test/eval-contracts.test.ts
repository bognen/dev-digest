import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EvalCaseUpsert,
  EvalCaseDetail,
  EvalSuiteRunDetail,
  EvalOwnerDashboard,
  EvalOverview,
  CreateCaseFromFindingResult,
} from '@devdigest/shared';

/** SPEC-06 contracts: fixtures parse, limits enforced, server/client copies identical (NFR-6). */

const config = {
  agent_id: 'a1',
  agent_name: 'Security Reviewer',
  agent_version: 7,
  provider: 'openai',
  model: 'gpt-4.1',
  system_prompt: 'You are a security-focused PR reviewer.',
  strategy: 'single-pass',
  skills: [{ id: 's1', name: 'secret-leakage-gate', version: 3 }],
};

const run = {
  id: 'r1',
  owner_kind: 'agent',
  owner_id: 'a1',
  host_agent_id: 'a1',
  scope: 'full',
  status: 'done',
  agent_version: 7,
  config,
  case_ids: ['c1'],
  recall: 0.82,
  precision: 0.91,
  citation_accuracy: 0.95,
  vacuous: { recall: false, precision: false, citation_accuracy: false },
  traces_passed: 17,
  traces_total: 20,
  cost_usd: 0.23,
  duration_ms: 1800,
  error: null,
  started_at: '2026-05-29T09:14:00.000Z',
  finished_at: '2026-05-29T09:14:02.000Z',
};

const caseDetail = {
  id: 'c1',
  owner_kind: 'agent',
  owner_id: 'a1',
  name: 'stripe-key-leak',
  input_diff: '--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,6 +10,7 @@\n+  stripeKey: "sk_live_x",',
  input_files: [{ path: 'src/config.ts', content: 'x' }],
  input_meta: { pr_title: 'Add Stripe', pr_body: '', source: null },
  expected_output: {
    expectations: [{ id: 'e1', type: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 12, severity: 'CRITICAL' }],
  },
  notes: null,
  source_finding_id: null,
  created_at: run.started_at,
  updated_at: run.started_at,
  last_result: null,
};

describe('SPEC-06 eval contracts', () => {
  it('case, run detail, dashboards and create-from-finding parse', () => {
    expect(() => EvalCaseDetail.parse(caseDetail)).not.toThrow();
    expect(() => CreateCaseFromFindingResult.parse({ case: caseDetail, created: true, note: null })).not.toThrow();
    expect(() =>
      EvalSuiteRunDetail.parse({
        ...run,
        results: [
          {
            id: 'x',
            case_id: null,
            case_name: 'stripe-key-leak',
            status: 'pass',
            expected: caseDetail.expected_output,
            kept: [],
            dropped: [],
            matched: ['e1'],
            unmatched: [],
            duration_ms: 1800,
            cost_usd: 0.02,
            error: null,
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      EvalOwnerDashboard.parse({
        owner_kind: 'agent',
        owner_id: 'a1',
        owner_name: 'Security Reviewer',
        model: 'gpt-4.1',
        cases_total: 20,
        latest: run,
        delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01 },
        alert: 'Precision dipped 2pts on v7',
        running: null,
        trend: [
          {
            run_id: 'r1',
            agent_version: 7,
            ran_at: run.started_at,
            recall: 0.82,
            precision: 0.91,
            citation_accuracy: 0.95,
            traces_passed: 17,
            traces_total: 20,
            cost_usd: 0.23,
          },
        ],
        history: [run],
      }),
    ).not.toThrow();
    expect(() =>
      EvalOverview.parse({
        agents: [
          {
            agent_id: 'a1',
            name: 'Security Reviewer',
            model: 'gpt-4.1',
            enabled: true,
            cases_total: 20,
            latest: run,
            spark: [0.78, 0.82],
            running: false,
          },
        ],
        recent_runs: [{ ...run, owner_name: 'Security Reviewer' }],
      }),
    ).not.toThrow();
  });

  it('manual upsert applies defaults and enforces limits', () => {
    const base = {
      owner_kind: 'agent',
      owner_id: '7b1f9c38-6a0f-4d38-9c51-4f3d1c1b2a10',
      name: 'x',
      input_diff: 'd',
      expectations: [],
    };
    const parsed = EvalCaseUpsert.parse(base);
    expect(parsed).toMatchObject({ input_files: [], pr_title: '', pr_body: '' });
    expect(EvalCaseUpsert.safeParse({ ...base, name: '  ' }).success).toBe(false);
    const files = Array.from({ length: 11 }, (_, i) => ({ path: `f${i}`, content: '' }));
    expect(EvalCaseUpsert.safeParse({ ...base, input_files: files }).success).toBe(false);
    expect(EvalCaseUpsert.safeParse({ ...base, owner_id: 'not-a-uuid' }).success).toBe(false);
  });

  it('server and client vendored eval-ci.ts are byte-identical (NFR-6)', () => {
    const rel = (p: string) => fileURLToPath(new URL(p, import.meta.url));
    const server = readFileSync(rel('../src/vendor/shared/contracts/eval-ci.ts'));
    const client = readFileSync(rel('../../client/src/vendor/shared/contracts/eval-ci.ts'));
    expect(server.equals(client)).toBe(true);
  });
});
