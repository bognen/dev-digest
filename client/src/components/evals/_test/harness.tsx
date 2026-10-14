/* Test harness for the SPEC-06 eval UI: intl (eval + shell + skills + agents) +
   query client + toast providers, a `fetch` mock keyed by "METHOD /path", and
   fixtures. Not a route (underscore folder). */
import React from "react";
import { vi } from "vitest";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  EvalCaseDetail,
  EvalConfigSnapshot,
  EvalOwnerDashboard,
  EvalSuiteRun,
  EvalSuiteRunDetail,
} from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import shellMessages from "../../../../messages/en/shell.json";
import skillsMessages from "../../../../messages/en/skills.json";
import agentsMessages from "../../../../messages/en/agents.json";
import { API_BASE } from "@/lib/api";
import { ToastProvider } from "@/lib/toast";

export function renderWithProviders(ui: React.ReactElement): RenderResult {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        messages={{ eval: evalMessages, shell: shellMessages, skills: skillsMessages, agents: agentsMessages }}
      >
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

type Route = unknown | { status: number; body: unknown };
const isStatus = (r: unknown): r is { status: number; body: unknown } =>
  !!r && typeof r === "object" && "status" in (r as object) && "body" in (r as object);

/** Stub global `fetch`; unknown routes respond 404. */
export function mockFetch(routes: Record<string, Route>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).replace(API_BASE, "")}`;
    if (!(key in routes)) {
      return new Response(JSON.stringify({ error: { message: `no route ${key}` } }), { status: 404 });
    }
    const r = routes[key];
    const status = isStatus(r) ? r.status : 200;
    const body = isStatus(r) ? r.body : r;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export function calledWith(fn: ReturnType<typeof mockFetch>, method: string, path: string): boolean {
  return fn.mock.calls.some(([u, init]) => u === `${API_BASE}${path}` && (init?.method ?? "GET") === method);
}

export function bodyOf(fn: ReturnType<typeof mockFetch>, method: string, path: string): unknown {
  const call = fn.mock.calls.find(([u, init]) => u === `${API_BASE}${path}` && (init?.method ?? "GET") === method);
  return call?.[1]?.body ? JSON.parse(String(call[1].body)) : undefined;
}

// ---------------------------------------------------------------- fixtures

export const CONFIG: EvalConfigSnapshot = {
  agent_id: "a1",
  agent_name: "Security Reviewer",
  agent_version: 7,
  provider: "openai",
  model: "gpt-4.1",
  system_prompt:
    "You are a security-focused PR reviewer.\nReturn at most 5 findings ranked by severity.\nFlag unused imports as suggestions.",
  strategy: "single-pass",
  skills: [],
};

export function run(over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: "r7",
    owner_kind: "agent",
    owner_id: "a1",
    host_agent_id: "a1",
    scope: "full",
    status: "done",
    agent_version: 7,
    config: CONFIG,
    case_ids: ["c1", "c2", "c3"],
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    vacuous: { recall: false, precision: false, citation_accuracy: false },
    traces_passed: 17,
    traces_total: 20,
    cost_usd: 0.23,
    duration_ms: 1800,
    error: null,
    started_at: "2026-05-29T09:14:00.000Z",
    finished_at: "2026-05-29T09:14:02.000Z",
    ...over,
  };
}

export function detail(over: Partial<EvalSuiteRunDetail> = {}): EvalSuiteRunDetail {
  return { ...run(over), results: [], ...over };
}

const mf = (sev: string, cat: string) => ({
  expectations: [{ id: "e1", type: "must_find" as const, file: "src/config.ts", start_line: 12, end_line: 12, severity: sev, category: cat }],
});

export function evalCase(over: Partial<EvalCaseDetail> = {}): EvalCaseDetail {
  return {
    id: "c1",
    owner_kind: "agent",
    owner_id: "a1",
    name: "stripe-key-leak",
    input_diff: "--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,2 +10,3 @@\n port: 3000,\n+  stripeKey: \"sk_live_x\",\n };",
    input_files: [],
    input_meta: { pr_title: "Add Stripe", pr_body: "", source: null },
    expected_output: mf("CRITICAL", "security"),
    notes: null,
    source_finding_id: null,
    created_at: "2026-05-20T10:00:00.000Z",
    updated_at: "2026-05-20T10:00:00.000Z",
    last_result: null,
    ...over,
  };
}

export const CASES: EvalCaseDetail[] = [
  evalCase({
    id: "c1",
    name: "stripe-key-leak",
    last_result: { status: "pass", expected_findings: 1, got_findings: 1, ran_at: "x", duration_ms: 1800, cost_usd: 0.02, error: null },
  }),
  evalCase({
    id: "c2",
    name: "missing-retry-after",
    expected_output: mf("WARNING", "bug"),
    last_result: { status: "fail", expected_findings: 1, got_findings: 0, ran_at: "x", duration_ms: 1000, cost_usd: 0.01, error: null },
  }),
  evalCase({ id: "c3", name: "clean-refactor-no-flags", expected_output: { expectations: [] }, last_result: null }),
];

export function dashboard(over: Partial<EvalOwnerDashboard> = {}): EvalOwnerDashboard {
  const latest = run();
  const previous = run({ id: "r6", agent_version: 6, recall: 0.78, precision: 0.93, citation_accuracy: 0.94, started_at: "2026-05-27T16:40:00.000Z", cost_usd: 0.21 });
  return {
    owner_kind: "agent",
    owner_id: "a1",
    owner_name: "Security Reviewer",
    model: "gpt-4.1",
    cases_total: 3,
    latest,
    delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01 },
    alert: "Precision dipped 2pts on v7",
    running: null,
    trend: [previous, latest].map((r) => ({
      run_id: r.id,
      agent_version: r.agent_version,
      ran_at: r.started_at,
      recall: r.recall!,
      precision: r.precision!,
      citation_accuracy: r.citation_accuracy!,
      traces_passed: r.traces_passed,
      traces_total: r.traces_total,
      cost_usd: r.cost_usd,
    })),
    history: [latest, previous],
    ...over,
  };
}
