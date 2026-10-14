import * as t from '../../db/schema.js';

export function toTagDto(row: typeof t.tags.$inferSelect) {
  return {
    id: row.id,
    repo_id: row.repoId,
    label: row.label,
    color: row.color,
    usage_count: row.usageCount,
  };
}

export function sortByUsage<T extends { usageCount: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.usageCount - a.usageCount);
}

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '-');
}
