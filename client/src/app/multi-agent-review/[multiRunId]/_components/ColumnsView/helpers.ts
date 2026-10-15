import { COLUMN_GAP, COLUMN_MIN_WIDTH, MAX_VISIBLE_COLUMNS } from "./constants";

/**
 * Grid template for `count` columns: up to 5 share the row; beyond that each
 * column keeps the 5-up width and the container scrolls horizontally (AC-48).
 */
export function columnsTemplate(count: number): string {
  if (count <= MAX_VISIBLE_COLUMNS) {
    return `repeat(${Math.max(count, 1)}, minmax(${COLUMN_MIN_WIDTH}px, 1fr))`;
  }
  const gaps = COLUMN_GAP * (MAX_VISIBLE_COLUMNS - 1);
  return `repeat(${count}, minmax(${COLUMN_MIN_WIDTH}px, calc((100% - ${gaps}px) / ${MAX_VISIBLE_COLUMNS})))`;
}

/** True when the columns overflow and the row must scroll. */
export function scrolls(count: number): boolean {
  return count > MAX_VISIBLE_COLUMNS;
}
