import { Suspense } from "react";
import { ConfigureRun } from "./_components/ConfigureRun";

/* Route: /multi-agent-review (Configure run). Thin entry — the screen and its
   state live in _components/ConfigureRun. Suspense is required because the
   screen reads `?pr=` through useSearchParams. */
export default function MultiAgentReviewPage() {
  return (
    <Suspense fallback={null}>
      <ConfigureRun />
    </Suspense>
  );
}
