/**
 * Deterministic per-agent accent color for the multi-agent review surfaces
 * (column top border, icon tile, tab dot). Colors are existing design tokens,
 * never hex, so they follow the theme.
 */

export const AGENT_PALETTE = [
  "var(--crit)",
  "var(--warn)",
  "var(--info)",
  "var(--ok)",
  "var(--accent)",
  "var(--sugg)",
] as const;

/** Neutral color for an agent that no longer exists (`agent_id` null). */
export const AGENT_COLOR_NEUTRAL = "var(--text-muted)";

/** Stable color for an agent id: same id -> same color; `null` -> neutral. */
export function agentColor(agentId: string | null | undefined): string {
  if (!agentId) return AGENT_COLOR_NEUTRAL;
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) >>> 0;
  }
  return AGENT_PALETTE[hash % AGENT_PALETTE.length]!;
}
