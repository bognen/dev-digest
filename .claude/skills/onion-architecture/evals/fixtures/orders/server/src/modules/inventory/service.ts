import { lowStock } from './helpers.js';
import type { InventoryLevel, InventoryRepo } from './types.js';

export interface InventoryServiceDeps {
  repo: InventoryRepo;
}

export class InventoryService {
  constructor(private deps: InventoryServiceDeps) {}

  async levelsFor(workspaceId: string, skus: string[]): Promise<InventoryLevel[]> {
    return this.deps.repo.levels(workspaceId, skus);
  }

  async lowStockFor(workspaceId: string, skus: string[], threshold: number): Promise<InventoryLevel[]> {
    return lowStock(await this.levelsFor(workspaceId, skus), threshold);
  }
}
