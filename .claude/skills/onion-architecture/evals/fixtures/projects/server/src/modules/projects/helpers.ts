import { PROJECT_PAGE_LIMIT } from './service.js';
import type { ProjectRecord } from './types.js';

export function clampLimit(requested: number | undefined): number {
  if (!requested || requested < 1) return PROJECT_PAGE_LIMIT;
  return Math.min(requested, PROJECT_PAGE_LIMIT);
}

export function toProjectDto(p: ProjectRecord) {
  return {
    id: p.id,
    name: p.name,
    archived: p.archived,
    touched_at: p.touchedAt.toISOString(),
  };
}
