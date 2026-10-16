/* hooks/multi-agent.ts — React Query hooks for multi-agent review (SPEC-07).
   Create a multi-run, poll its detail while any child is queued/running,
   list a repo's previous runs, cancel all, and read per-agent estimates. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentEstimatesResponse,
  CancelMultiRunResponse,
  CreateMultiRunRequest,
  CreateMultiRunResponse,
  LatestMultiRunResponse,
  MultiRunDetail,
  MultiRunListResponse,
} from "@devdigest/shared";

const POLL_MS = 4000;

/** Per-agent median duration/cost; an agent without an entry has no estimate. */
export function useAgentEstimates() {
  return useQuery({
    queryKey: ["agent-estimates"],
    queryFn: () => api.get<AgentEstimatesResponse>("/agent-estimates"),
  });
}

/** Start a multi-agent review of a PR with the chosen agents. */
export interface CreateMultiRunInput extends CreateMultiRunRequest {
  prId: string;
}

export function useCreateMultiRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agent_ids }: CreateMultiRunInput) =>
      api.post<CreateMultiRunResponse>(`/pulls/${prId}/multi-agent-runs`, { agent_ids }),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["multi-run-latest", prId] });
      qc.invalidateQueries({ queryKey: ["multi-runs"] });
      qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
    },
  });
}

/** Multi-run detail; polls every 4s while its aggregate status is `running`. */
export function useMultiRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-run", id],
    queryFn: () => api.get<MultiRunDetail>(`/multi-agent-runs/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === "running" ? POLL_MS : false),
  });
}

/** A repo's previous multi-runs, newest first; polls while any is running. */
export function useMultiRuns(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-runs", repoId],
    queryFn: () =>
      api.get<MultiRunListResponse>(`/multi-agent-runs?repo_id=${encodeURIComponent(repoId!)}`),
    enabled: !!repoId,
    refetchInterval: (query) =>
      query.state.data?.multi_runs.some((r) => r.status === "running") ? POLL_MS : false,
  });
}

/** Newest multi-run of a PR (or `multi_run: null`); polls while it is running. */
export function useLatestMultiRun(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-run-latest", prId],
    queryFn: () => api.get<LatestMultiRunResponse>(`/pulls/${prId}/multi-agent-runs/latest`),
    enabled: !!prId,
    refetchInterval: (query) =>
      query.state.data?.multi_run?.status === "running" ? POLL_MS : false,
  });
}

/** Cancel every queued/running child of a multi-run. */
export function useCancelMultiRun(id: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CancelMultiRunResponse>(`/multi-agent-runs/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multi-run", id] });
      qc.invalidateQueries({ queryKey: ["multi-run-latest"] });
      qc.invalidateQueries({ queryKey: ["multi-runs"] });
    },
  });
}
