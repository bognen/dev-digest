import { Suspense } from "react";
import { AgentPerformanceView } from "./_components/AgentPerformanceView";

/* Route: /agent-performance (global Agent Performance dashboard). Thin route
   entry — the view lives in _components/AgentPerformanceView. Suspense is
   required because the view reads the range from useSearchParams. */
export default function AgentPerformancePage() {
  return (
    <Suspense>
      <AgentPerformanceView />
    </Suspense>
  );
}
