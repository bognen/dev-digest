/* hooks/project-context.ts — React Query hooks for Project Context (SPEC-01):
   the repo docs browser and the per-agent / per-skill attached docs.
   Query keys: ["project-docs", repoId], ["project-doc", repoId, path],
   ["agent-context", agentId, repoId], ["skill-context", skillId, repoId]. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentContextState,
  ContextAttachmentRow,
  ProjectDocContent,
  ProjectDocList,
  SetContextDocsBody,
  SkillContextState,
} from "@devdigest/shared";

export function useProjectDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-docs", repoId],
    queryFn: () => api.get<ProjectDocList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useProjectDoc(
  repoId: string | null | undefined,
  path: string | null | undefined,
) {
  return useQuery({
    queryKey: ["project-doc", repoId, path],
    queryFn: () =>
      api.get<ProjectDocContent>(
        `/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
  });
}

export function useRefreshProjectDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ProjectDocList>(`/repos/${repoId}/context/refresh`),
    onSuccess: (list, repoId) => {
      qc.setQueryData(["project-docs", repoId], list);
      // File contents may have changed on disk after a sync.
      qc.invalidateQueries({ queryKey: ["project-doc", repoId] });
    },
  });
}

export function useAgentContext(
  agentId: string | null | undefined,
  repoId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["agent-context", agentId, repoId],
    queryFn: () =>
      api.get<AgentContextState>(`/agents/${agentId}/context?repo_id=${repoId}`),
    enabled: !!agentId && !!repoId,
  });
}

export function useSkillContext(
  skillId: string | null | undefined,
  repoId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["skill-context", skillId, repoId],
    queryFn: () =>
      api.get<SkillContextState>(`/skills/${skillId}/context?repo_id=${repoId}`),
    enabled: !!skillId && !!repoId,
  });
}

/** Rebuild `attached` for the given ordered paths, reusing known rows / doc list info. */
function optimisticAttached(
  qc: QueryClient,
  repoId: string,
  current: ContextAttachmentRow[],
  paths: string[],
): ContextAttachmentRow[] {
  const known = new Map(current.map((r) => [r.path, r]));
  const list = qc.getQueryData<ProjectDocList>(["project-docs", repoId]);
  const listed = new Map((list?.docs ?? []).map((d) => [d.path, d]));
  const rows: ContextAttachmentRow[] = [];
  for (const path of paths) {
    const row = known.get(path);
    if (row) {
      rows.push(row);
      continue;
    }
    const doc = listed.get(path);
    if (doc) {
      rows.push({
        path,
        root: doc.root,
        tokens: doc.tokens,
        state: doc.too_large ? "too_large" : "ok",
      });
    }
  }
  return rows;
}

interface SetContextVars {
  repoId: string;
  paths: string[];
}

export function useSetAgentContext(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, paths }: SetContextVars) => {
      const body: SetContextDocsBody = { repo_id: repoId, paths };
      return api.put<AgentContextState>(`/agents/${agentId}/context`, body);
    },
    onMutate: async ({ repoId, paths }) => {
      const key = ["agent-context", agentId, repoId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AgentContextState>(key);
      if (prev) {
        qc.setQueryData<AgentContextState>(key, {
          ...prev,
          attached: optimisticAttached(qc, repoId, prev.attached, paths),
        });
      }
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSuccess: (state, { repoId }) => {
      qc.setQueryData(["agent-context", agentId, repoId], state);
      // Usage counters (used_by_agents) on the docs list.
      qc.invalidateQueries({ queryKey: ["project-docs", repoId] });
    },
  });
}

export function useSetSkillContext(skillId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, paths }: SetContextVars) => {
      const body: SetContextDocsBody = { repo_id: repoId, paths };
      return api.put<SkillContextState>(`/skills/${skillId}/context`, body);
    },
    onMutate: async ({ repoId, paths }) => {
      const key = ["skill-context", skillId, repoId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SkillContextState>(key);
      if (prev) {
        qc.setQueryData<SkillContextState>(key, {
          ...prev,
          attached: optimisticAttached(qc, repoId, prev.attached, paths),
        });
      }
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSuccess: (state, { repoId }) => {
      qc.setQueryData(["skill-context", skillId, repoId], state);
      qc.invalidateQueries({ queryKey: ["project-docs", repoId] });
      // Inherited rows of every agent using this skill change.
      qc.invalidateQueries({ queryKey: ["agent-context"] });
    },
  });
}
