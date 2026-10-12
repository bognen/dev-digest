import type { WarehouseClient } from '../vendor/shared/adapters.js';

export class MockWarehouse implements WarehouseClient {
  reserved: Array<{ sku: string; qty: number }> = [];

  async reserve(sku: string, qty: number): Promise<{ reservationId: string }> {
    this.reserved.push({ sku, qty });
    return { reservationId: 'mock-' + this.reserved.length };
  }

  async release(): Promise<void> {}
}
