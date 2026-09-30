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
 * A PR's derived intent — a plain GET of the cached record, NEVER a generation.
 * Intent is produced in exactly two ways: the user presses "Run Intent" on the
 * card (`useRegenerateIntent`), or an agent run derives it (the run-settled
 * invalidation in `page.tsx` then refetches this query). Opening the page must
 * not spend an LLM call.
 */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: prIntentKey(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
    retry: false,
    staleTime: INTENT_STALE_TIME_MS,
  });
}

/** Derive/regenerate a PR's intent (the card's "Run Intent"/"Regenerate"/"Retry" actions). */
export function useRegenerateIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent`, { force: true }),
    onSuccess: (data) => {
      qc.setQueryData(prIntentKey(prId), data);
    },
  });
}
