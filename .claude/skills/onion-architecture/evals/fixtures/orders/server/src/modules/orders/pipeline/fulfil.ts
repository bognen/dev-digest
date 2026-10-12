import { HttpWarehouse } from '../../../adapters/warehouse/index.js';
import type { Logger, OrderRecord } from '../types.js';

export async function reserveAll(order: OrderRecord, warehouseUrl: string, apiKey: string, log: Logger): Promise<string[]> {
  const warehouse = new HttpWarehouse(warehouseUrl, apiKey);
  const reservations: string[] = [];
  for (const line of order.lines) {
    const { reservationId } = await warehouse.reserve(line.sku, line.qty);
    reservations.push(reservationId);
    log.info({ orderId: order.id, sku: line.sku, reservationId }, 'line reserved');
  }
  return reservations;
}
