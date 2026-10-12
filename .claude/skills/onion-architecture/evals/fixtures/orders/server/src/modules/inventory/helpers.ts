import type { InventoryLevel } from './types.js';

export function lowStock(levels: InventoryLevel[], threshold: number): InventoryLevel[] {
  return levels.filter((l) => l.onHand <= threshold);
}
