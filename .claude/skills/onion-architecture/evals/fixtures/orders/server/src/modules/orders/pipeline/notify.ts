import type { Logger, OrderRecord, WarehouseClient } from '../types.js';

export async function releaseAll(order: OrderRecord, reservations: string[], warehouse: WarehouseClient, log: Logger): Promise<void> {
  for (const reservationId of reservations) {
    await warehouse.release(reservationId).catch((err) => {
      log.warn({ orderId: order.id, reservationId, err }, 'release failed');
    });
  }
}
