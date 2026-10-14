"use client";

import { useParams } from "next/navigation";
import { AgentEvalDashboard } from "./_components/AgentEvalDashboard";

/* Route: /evals/agents/:id (one agent's eval dashboard, SPEC-06 AC-39). Thin
   route entry — the view lives in _components/AgentEvalDashboard. */
export default function AgentEvalDashboardPage() {
  const { id } = useParams<{ id: string }>();
  return <AgentEvalDashboard agentId={id} />;
}
