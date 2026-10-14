export interface InventoryLevel {
  sku: string;
  onHand: number;
}

export interface InventoryRepo {
  levels(workspaceId: string, skus: string[]): Promise<InventoryLevel[]>;
  adjust(workspaceId: string, sku: string, delta: number): Promise<void>;
}
