import type { CurrencyCode } from '@devdigest/shared';

export interface OrderLineRecord {
  sku: string;
  qty: number;
  unitCents: number;
}

export interface OrderRecord {
  id: string;
  workspaceId: string;
  customerId: string;
  status: string;
  totalCents: number;
  currency: CurrencyCode;
  lines: OrderLineRecord[];
  placedAt: Date;
}

export interface NewOrder {
  customerId: string;
  currency: CurrencyCode;
  lines: OrderLineRecord[];
  totalCents: number;
}

export interface OrdersRepo {
  getById(workspaceId: string, id: string): Promise<OrderRecord | undefined>;
  insert(workspaceId: string, order: NewOrder): Promise<OrderRecord>;
  setStatus(workspaceId: string, id: string, status: string): Promise<void>;
}

export interface WarehouseClient {
  reserve(sku: string, qty: number): Promise<{ reservationId: string }>;
  release(reservationId: string): Promise<void>;
}

export interface Logger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}
