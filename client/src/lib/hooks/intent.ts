/* hooks/intent.ts — the Intent Layer. GET /pulls/:id/intent returns the
   cached (or not-yet-generated) intent; POST derives/regenerates it. A missing
   provider key or LLM failure is a 200 with `unavailable_reason`, never an
   error — so this never needs to retry or toast on its own. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse } from "@devdigest/shared";

/** Long-lived: an unchanged PR's intent doesn't need refetching on its own —
   `page.tsx`'s run-settled invalidation is what refreshes it after a review. */
const INTENT_STALE_TIME_MS = 5 * 60 * 1000;

/** The query key for a PR's intent — the one place it's defined, so callers
   (this file, and `page.tsx`'s run-settled invalidation) never drift apart. */
export function prIntentKey(prId: string | null | undefined) {
  return ["pr-intent", prId] as const;
}

/**
 * A PR's derived intent. Composes GET -> POST (once) inside `queryFn` itself
 * (no `useEffect`): read the cached record first, and only issue the
 * (LLM-costing) POST when the server reports `not_generated` — so the card
 * still renders correctly before any review has ever run for this PR.
 */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: prIntentKey(prId),
    queryFn: async () => {
      const first = await api.get<PrIntentResponse>(`/pulls/${prId}/intent`);
      if (first.unavailable_reason !== "not_generated") return first;
      return api.post<PrIntentResponse>(`/pulls/${prId}/intent`);
    },
    enabled: !!prId,
    retry: false,
    staleTime: INTENT_STALE_TIME_MS,
  });
}

/** Force-regenerate a PR's intent (the card's "Regenerate"/"Retry" actions). */
export function useRegenerateIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent`, { force: true }),
    onSuccess: (data) => {
      qc.setQueryData(prIntentKey(prId), data);
    },
  });
}
