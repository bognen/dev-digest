"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  parseRangeParams,
  resolveRange,
  writeRangeParams,
  type ResolvedRange,
  type StatsRangeState,
} from "@/lib/stats-range";

/**
 * URL-backed stats range shared by the agent Stats tab and the Agent
 * Performance dashboard. "Now" for rolling presets is captured once at mount,
 * so re-renders, sorting or expanding rows never change the query key.
 */
export function useStatsRange(): {
  state: StatsRangeState;
  range: ResolvedRange | null;
  setState: (next: StatsRangeState) => void;
} {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [mountedAt] = React.useState(() => new Date());
  const state = parseRangeParams(search);
  const { preset, from, to, at } = state;
  const range = React.useMemo(
    () => resolveRange({ preset, from, to, at }, mountedAt),
    [preset, from, to, at, mountedAt],
  );
  const setState = (next: StatsRangeState) =>
    router.replace(`${pathname}?${writeRangeParams(new URLSearchParams(search.toString()), next).toString()}`);
  return { state, range, setState };
}
