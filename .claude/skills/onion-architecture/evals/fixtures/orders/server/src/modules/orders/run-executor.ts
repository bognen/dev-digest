import { releaseAll } from './pipeline/notify.js';
import { reserveAll } from './pipeline/fulfil.js';
import type { Logger, OrdersRepo, WarehouseClient } from './types.js';

export interface FulfilDeps {
  repo: OrdersRepo;
  warehouse: WarehouseClient;
  warehouseUrl: string;
  warehouseKey: string;
  log: Logger;
}

export async function fulfilOrder(deps: FulfilDeps, workspaceId: string, orderId: string): Promise<void> {
  const order = await deps.repo.getById(workspaceId, orderId);
  if (!order) return;
  let reservations: string[] = [];
  try {
    reservations = await reserveAll(order, deps.warehouseUrl, deps.warehouseKey, deps.log);
    await deps.repo.setStatus(workspaceId, orderId, 'reserved');
  } catch (err) {
    deps.log.error({ orderId, err }, 'fulfilment failed');
    await releaseAll(order, reservations, deps.warehouse, deps.log);
    await deps.repo.setStatus(workspaceId, orderId, 'cancelled');
  }
}
