/* hooks/ci.ts — React Query hooks for SPEC-07 Export to CI: the agent CI tab,
   the CI Runs page, the export wizard (preview / secrets / install / zip) and
   removal. CI data is pulled from GitHub on demand, so no query refetches on
   window focus; only the CI Runs list re-pulls on a fixed interval while mounted. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiDownload } from "../api";
import type {
  CiAgentOverview,
  CiInstallInput,
  CiInstallResult,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRemoveResult,
  CiRun,
  CiSecretsStatus,
  CiZipInput,
} from "@devdigest/shared";

/** How often the CI Runs page re-pulls while it is open. */
export const CI_RUNS_REFRESH_MS = 60_000;

const keys = {
  overview: (agentId: string) => ["ci-overview", agentId] as const,
  overviewAll: ["ci-overview"] as const,
  runs: ["ci-runs"] as const,
  secrets: (agentId: string, repoId: string) => ["ci-secrets", agentId, repoId] as const,
};

/** `GET /agents/:id/ci` — installations + recent runs for the agent CI tab. */
export function useCiOverview(agentId: string | null | undefined) {
  return useQuery({
    queryKey: keys.overview(agentId ?? ""),
    queryFn: () => api.get<CiAgentOverview>(`/agents/${agentId}/ci`),
    enabled: !!agentId,
    refetchOnWindowFocus: false,
  });
}

/** `GET /ci/runs` — every CI run; refetched every 60 s while the page is mounted. */
export function useCiRuns() {
  return useQuery({
    queryKey: keys.runs,
    queryFn: () => api.get<CiRun[]>("/ci/runs"),
    refetchOnWindowFocus: false,
    refetchInterval: CI_RUNS_REFRESH_MS,
  });
}

/** Names-only Actions secrets status for the wizard's Configure step. */
export function useCiSecretsStatus(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: keys.secrets(agentId ?? "", repoId ?? ""),
    queryFn: () => api.get<CiSecretsStatus>(`/agents/${agentId}/ci/secrets?repo_id=${repoId}`),
    enabled: !!agentId && !!repoId,
    refetchOnWindowFocus: false,
  });
}

export interface CiPreviewVars {
  agentId: string;
  body: CiPreviewInput;
}

/** Generates the file bundle for the wizard's Preview step (no GitHub writes). */
export function useCiPreview() {
  return useMutation({
    mutationFn: ({ agentId, body }: CiPreviewVars) =>
      api.post<CiPreview>(`/agents/${agentId}/ci/preview`, body),
  });
}

export interface CiInstallVars {
  agentId: string;
  body: CiInstallInput;
}

/** Opens (or updates) the install pull request. */
export function useCiInstall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, body }: CiInstallVars) =>
      api.post<CiInstallResult>(`/agents/${agentId}/ci/install`, body),
    onSuccess: (_d, { agentId }) => {
      qc.invalidateQueries({ queryKey: keys.overview(agentId) });
      qc.invalidateQueries({ queryKey: keys.runs });
    },
  });
}

export interface CiZipVars {
  agentId: string;
  /** Preview input plus the hand-edited workflow, when the user changed it. */
  body: CiZipInput;
  /** Download file name; defaults to `devdigest-ci.zip`. */
  filename?: string;
}

/** Downloads the bundle as a zip. Creates no installation, so nothing is invalidated. */
export function useCiZip() {
  return useMutation({
    mutationFn: async ({ agentId, body, filename = "devdigest-ci.zip" }: CiZipVars) => {
      const blob = await apiDownload(`/agents/${agentId}/ci/zip`, body);
      saveBlob(blob, filename);
      return blob;
    },
  });
}

export interface CiRemoveVars {
  agentId: string;
  installationId: string;
  branch?: string;
}

/** "Remove from CI": opens a removal PR, or deletes directly if never merged. */
export function useCiRemove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, installationId, branch }: CiRemoveVars) =>
      api.post<CiRemoveResult>(
        `/agents/${agentId}/ci/installations/${installationId}/remove`,
        branch ? { branch } : undefined,
      ),
    onSuccess: (_d, { agentId }) => {
      qc.invalidateQueries({ queryKey: keys.overview(agentId) });
      qc.invalidateQueries({ queryKey: keys.runs });
    },
  });
}

/** `POST /ci/refresh` — pull-only ingest of new workflow runs; refreshes every CI view. */
export function useRefreshCi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CiRefreshResult>("/ci/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.runs });
      qc.invalidateQueries({ queryKey: keys.overviewAll });
    },
  });
}

/** Browser download of a Blob via a temporary object URL. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
