/* hooks/eval.ts — React Query hooks for the SPEC-06 eval pipeline: cases,
   suite runs, dashboards, compare/promote and run-all. A running suite run is
   polled until it reaches a terminal status, then every eval view refreshes. */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CreateCaseFromFindingResult,
  EvalCaseDetail,
  EvalCaseUpsertBody,
  EvalOverview,
  EvalOwnerDashboard,
  EvalOwnerKind,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  PromoteResult,
  RunAllResult,
} from "@devdigest/shared";

/** How often a running suite run is re-fetched. */
export const EVAL_POLL_MS = 2000;

const keys = {
  all: ["eval"] as const,
  cases: (kind: EvalOwnerKind, id: string) => ["eval", "cases", kind, id] as const,
  sources: ["eval", "sources"] as const,
  dashboard: (kind: EvalOwnerKind, id: string, days: number) => ["eval", "dashboard", kind, id, days] as const,
  overview: ["eval", "overview"] as const,
  run: (id: string) => ["eval", "run", id] as const,
};

/** Every eval view reads from the `eval` key space — refresh it all after a change. */
function invalidateEval(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: keys.all });
}

export function useEvalCases(ownerKind: EvalOwnerKind, ownerId: string | null | undefined) {
  return useQuery({
    queryKey: keys.cases(ownerKind, ownerId ?? ""),
    queryFn: () => api.get<EvalCaseDetail[]>(`/eval/cases?owner_kind=${ownerKind}&owner_id=${ownerId}`),
    enabled: !!ownerId,
  });
}

/** Finding ids that already have an eval case (FindingCard shows "Eval case ✓"). */
export function useEvalCaseSources() {
  return useQuery({
    queryKey: keys.sources,
    queryFn: () => api.get<string[]>("/eval/cases/sources"),
    staleTime: 30_000,
  });
}

export function useCreateCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) =>
      api.post<CreateCaseFromFindingResult>(`/findings/${findingId}/eval-case`),
    onSuccess: () => invalidateEval(qc),
  });
}

export function useSaveEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: EvalCaseUpsertBody }) =>
      id ? api.put<EvalCaseDetail>(`/eval/cases/${id}`, body) : api.post<EvalCaseDetail>("/eval/cases", body),
    onSuccess: () => invalidateEval(qc),
  });
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/eval/cases/${id}`),
    onSuccess: () => invalidateEval(qc),
  });
}

export interface StartRunInput {
  ownerKind: EvalOwnerKind;
  ownerId: string;
  /** Skill evals only — the agent that hosts the skill. */
  hostAgentId?: string;
}

/** Start a full run of an owner's case set (202 → polled via useEvalRun). */
export function useStartEvalRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ownerKind, ownerId, hostAgentId }: StartRunInput) =>
      ownerKind === "agent"
        ? api.post<EvalSuiteRun>(`/agents/${ownerId}/eval-runs`)
        : api.post<EvalSuiteRun>(`/skills/${ownerId}/eval-runs`, hostAgentId ? { host_agent_id: hostAgentId } : {}),
    onSuccess: () => invalidateEval(qc),
  });
}

/** Run a single case (scope 'case'). */
export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, hostAgentId }: { caseId: string; hostAgentId?: string }) =>
      api.post<EvalSuiteRun>(`/eval/cases/${caseId}/run`, hostAgentId ? { host_agent_id: hostAgentId } : {}),
    onSuccess: () => invalidateEval(qc),
  });
}

/**
 * One suite run with its per-case results. While it is `running` it is polled;
 * the moment it finishes every eval query is invalidated (AC-42).
 */
export function useEvalRun(runId: string | null | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.run(runId ?? ""),
    queryFn: async () => {
      const run = await api.get<EvalSuiteRunDetail>(`/eval/runs/${runId}`);
      if (run.status !== "running") void qc.invalidateQueries({ queryKey: ["eval", "cases"] });
      return run;
    },
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data?.status === "running" ? EVAL_POLL_MS : false),
  });
}

/** Owner dashboard (KPIs, delta, alert, trend, history). Polls while a run is in progress. */
export function useEvalDashboard(ownerKind: EvalOwnerKind, ownerId: string | null | undefined, days: number) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.dashboard(ownerKind, ownerId ?? "", days),
    queryFn: async () => {
      const prev = qc.getQueryData<EvalOwnerDashboard>(keys.dashboard(ownerKind, ownerId ?? "", days));
      const next = await api.get<EvalOwnerDashboard>(`/eval/dashboard/${ownerKind}/${ownerId}?days=${days}`);
      // A run just finished → refresh the case list (last results) too.
      if (prev?.running && !next.running) void qc.invalidateQueries({ queryKey: ["eval", "cases"] });
      return next;
    },
    enabled: !!ownerId,
    refetchInterval: (q) => (q.state.data?.running ? EVAL_POLL_MS : false),
  });
}

export function useEvalOverview() {
  return useQuery({
    queryKey: keys.overview,
    queryFn: () => api.get<EvalOverview>("/eval/overview"),
    refetchInterval: (q) => (q.state.data?.agents.some((a) => a.running) ? EVAL_POLL_MS : false),
  });
}

export function useRunAllEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RunAllResult>("/eval/run-all"),
    onSuccess: () => invalidateEval(qc),
  });
}

export function usePromoteEvalRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.post<PromoteResult>(`/eval/runs/${runId}/promote`),
    onSuccess: (res) => {
      void invalidateEval(qc);
      void qc.invalidateQueries({ queryKey: ["agent", res.agent_id] });
      void qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
