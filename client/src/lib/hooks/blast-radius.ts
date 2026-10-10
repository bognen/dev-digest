/* hooks/blast-radius.ts — React Query hook for the Blast Radius tab.
   GET /pulls/:id/blast → changed symbols, their resolved cross-file callers,
   and impacted HTTP endpoints/crons — deterministic, no LLM call. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadiusResponse } from "@devdigest/shared";

export type { BlastRadiusResponse };
/** Derived from the shared contract so the UI vocabulary cannot drift. */
export type BlastIndexStatus = BlastRadiusResponse["status"];
export type BlastDegradedReason = NonNullable<BlastRadiusResponse["degradedReason"]>;

export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast-radius", prId],
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
