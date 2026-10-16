/* useCiAutoPull — pulls new workflow runs from GitHub (`/ci/refresh`) once on
   open and then every 60 s while the page is mounted, plus a manual `pull`.
   Never overlaps two pulls; the mutation invalidates the runs list on success. */
"use client";

import React from "react";
import { CI_RUNS_REFRESH_MS, useRefreshCi } from "@/lib/hooks";
import type { CiRefreshResult } from "@devdigest/shared";

export interface PullCallbacks {
  onSuccess?: (r: CiRefreshResult) => void;
  onError?: (e: Error) => void;
}

export function useCiAutoPull() {
  const refresh = useRefreshCi();
  const { mutateAsync } = refresh;
  const inFlight = React.useRef(false);

  // The guard is released from the `mutateAsync` promise, not per-call `mutate`
  // callbacks: those never fire once the observer detached (StrictMode's
  // mount → unmount → mount), which left the guard stuck and every later pull a no-op.
  const pull = React.useCallback(
    (cb?: PullCallbacks) => {
      if (inFlight.current) return;
      inFlight.current = true;
      mutateAsync(undefined)
        .then(
          (r) => cb?.onSuccess?.(r),
          (e) => cb?.onError?.(e as Error),
        )
        .finally(() => {
          inFlight.current = false;
        });
    },
    [mutateAsync],
  );

  React.useEffect(() => {
    pull();
    const id = setInterval(() => pull(), CI_RUNS_REFRESH_MS);
    return () => clearInterval(id);
  }, [pull]);

  return { pull, isPulling: refresh.isPending };
}
