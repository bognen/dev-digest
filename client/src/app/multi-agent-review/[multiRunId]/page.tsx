import { Suspense } from "react";
import { MultiRunResults } from "./_components/MultiRunResults";

/* Route: /multi-agent-review/:multiRunId (results). Thin entry — the page,
   its views and the trace drawer wiring live in _components/MultiRunResults.
   Suspense is required because the page reads `?trace=` via useSearchParams. */
export default async function MultiRunPage({
  params,
}: {
  params: Promise<{ multiRunId: string }>;
}) {
  const { multiRunId } = await params;
  return (
    <Suspense fallback={null}>
      <MultiRunResults multiRunId={multiRunId} />
    </Suspense>
  );
}
