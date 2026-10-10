/* hooks/smart-diff.ts — React Query hook for GET /pulls/:id/smart-diff
   (files grouped by role). Keyed by head sha so a new push refetches; the
   prefix key is exported so finding actions / run completion can invalidate it. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "@devdigest/shared";

export const smartDiffKey = (prId: string | null | undefined) => ["smart-diff", prId] as const;

export function useSmartDiff(prId: string | null | undefined, headSha: string | null | undefined) {
  return useQuery({
    queryKey: [...smartDiffKey(prId), headSha],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId && !!headSha,
  });
}
