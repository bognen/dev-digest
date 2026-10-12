/* hooks/onboarding-tour.ts — React Query hooks for the per-repo Onboarding Tour
   (specs/2026-10-10-onboarding-tour.md).

   GET /repos/:id/onboarding is read-only (AC-1: nothing generates on open) and
   polls (~3s) ONLY while `status === "generating"`, so a viewer who did not
   start the generation still sees it finish. POST .../generate is also
   "Regenerate"; it writes its result via `setQueryData`, so an in-flight GET is
   cancelled first or it could resolve after and overwrite the fresh result.
   A 409 (generation already running) just refreshes the state key. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { OnboardingTourState } from "@devdigest/shared";

export const onboardingTourKeys = {
  state: (repoId: string | null | undefined) => ["onboarding-tour", repoId] as const,
};

/** GET /repos/:id/onboarding — 0 LLM calls. */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: onboardingTourKeys.state(repoId),
    queryFn: () => api.get<OnboardingTourState>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === "generating" ? 3000 : false),
  });
}

/** POST /repos/:id/onboarding/generate — manual only (generate / regenerate). */
export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingTourState>(`/repos/${repoId}/onboarding/generate`, {}),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: onboardingTourKeys.state(repoId) });
    },
    onSuccess: (data) => {
      qc.setQueryData(onboardingTourKeys.state(repoId), data);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        void qc.invalidateQueries({ queryKey: onboardingTourKeys.state(repoId) });
      }
    },
  });
}
