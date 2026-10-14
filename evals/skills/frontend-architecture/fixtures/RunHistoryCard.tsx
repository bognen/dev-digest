// client/src/app/agents/[id]/_components/RunHistoryCard/RunHistoryCard.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@devdigest/ui/primitives/Button";
import { Badge } from "../../../../../vendor/ui/primitives/Badge";

type AgentRun = { id: string; status: string; cost_usd: number | null; started_at: string };

export function RunHistoryCard({ agentId }: { agentId: string }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);

  useEffect(() => {
    fetch(`http://localhost:3001/agents/${agentId}/runs`)
      .then((r) => r.json())
      .then((data: AgentRun[]) => setRuns(data.filter((r) => r.status !== "cancelled").slice(0, 25)));
  }, [agentId]);

  const total = runs.reduce((n, r) => n + (r.cost_usd ?? 0), 0);

  return (
    <div style={{ border: "1px solid #2a2f3a", borderRadius: 9, padding: 18, background: "#14171f" }}>
      <h3>Recent runs</h3>
      {runs.map((r) => (
        <div key={r.id} style={{ display: "flex", gap: 8 }}>
          <Badge>{r.status}</Badge>
          <span>{new Date(r.started_at).toLocaleString()}</span>
        </div>
      ))}
      <div>Total spend: ${total.toFixed(2)}</div>
      <Button onClick={() => setRuns([])}>Clear</Button>
    </div>
  );
}
