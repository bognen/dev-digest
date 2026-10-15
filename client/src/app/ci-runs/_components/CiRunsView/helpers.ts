import type { CiRun, CiRunStatus } from "@devdigest/shared";

/** Next filter value in the cycle null (all) → option 1 → … → option N → null. */
export function cycleOption<T>(options: readonly T[], current: T | null): T | null {
  if (options.length === 0) return null;
  if (current === null) return options[0] ?? null;
  const i = options.indexOf(current);
  return i < 0 || i === options.length - 1 ? null : (options[i + 1] ?? null);
}

/** Distinct agents present in the runs (by id), in first-seen order. */
export function agentOptions(runs: CiRun[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const r of runs) {
    if (r.agent_id && !seen.has(r.agent_id)) seen.set(r.agent_id, r.agent_name ?? r.agent_slug ?? r.agent_id);
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

export function repoOptions(runs: CiRun[]): string[] {
  return [...new Set(runs.map((r) => r.repo))];
}

export function statusOptions(runs: CiRun[]): CiRunStatus[] {
  return [...new Set(runs.map((r) => r.status))];
}
