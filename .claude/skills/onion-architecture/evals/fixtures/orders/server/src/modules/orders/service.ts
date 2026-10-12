import type { CurrencyCode } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { InventoryService } from '../inventory/service.js';
import type { InventoryLevel } from '../inventory/index.js';
import { OrdersRepository, type OrderRow } from './repository.js';
import { canMove, type OrderStatus } from './status.js';
import { totalWithTax } from './helpers.js';
import { MAX_LINES_PER_ORDER } from './constants.js';
import type { Logger, OrderRecord } from './types.js';

export interface OrdersServiceDeps {
  repo: OrdersRepository;
  inventory: InventoryService;
  log: Logger;
}

export class OrdersService {
  constructor(private deps: OrdersServiceDeps) {}

  async get(workspaceId: string, id: string): Promise<OrderRecord> {
    const order = await this.deps.repo.getById(workspaceId, id);
    if (!order) throw new NotFoundError('Order not found');
    return order;
  }

  async place(
    workspaceId: string,
    input: { customer_id: string; currency: CurrencyCode; line_items: Array<{ sku: string; qty: number; unit_cents: number }> },
  ): Promise<OrderRecord> {
    if (input.line_items.length === 0 || input.line_items.length > MAX_LINES_PER_ORDER) {
      throw new ValidationError('Invalid number of lines');
    }
    const lines = input.line_items.map((l) => ({ sku: l.sku, qty: l.qty, unitCents: l.unit_cents }));
    const levels: InventoryLevel[] = await this.deps.inventory.levelsFor(workspaceId, lines.map((l) => l.sku));
    const short = lines.filter((l) => (levels.find((lv) => lv.sku === l.sku)?.onHand ?? 0) < l.qty);
    if (short.length > 0) throw new ValidationError('Insufficient stock for ' + short[0]!.sku);
    this.deps.log.info({ workspaceId, lines: lines.length }, 'placing order');
    return this.deps.repo.insert(workspaceId, {
      customerId: input.customer_id,
      currency: input.currency,
      lines,
      totalCents: totalWithTax(lines),
    });
  }

  async describe(workspaceId: string, id: string): Promise<string> {
    const row: OrderRow | undefined = await this.deps.repo.getRow(workspaceId, id);
    if (!row) throw new NotFoundError('Order not found');
    return row.id + ':' + row.status + ':' + row.totalCents;
  }

  async transition(workspaceId: string, id: string, next: OrderStatus): Promise<void> {
    const order = await this.get(workspaceId, id);
    if (!canMove(order.status as OrderStatus, next)) {
      throw new ValidationError('Cannot move order from ' + order.status + ' to ' + next);
    }
    await this.deps.repo.setStatus(workspaceId, id, next);
  }
}
