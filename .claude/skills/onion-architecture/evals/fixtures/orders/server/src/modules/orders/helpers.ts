import type { OrderLineRecord, OrderRecord } from './types.js';

const TAX_RATE = Number(process.env.ORDER_TAX_RATE ?? '0.2');

export function subtotal(lines: OrderLineRecord[]): number {
  return lines.reduce((sum, l) => sum + l.qty * l.unitCents, 0);
}

export function totalWithTax(lines: OrderLineRecord[]): number {
  return Math.round(subtotal(lines) * (1 + TAX_RATE));
}

export function toOrderDto(o: OrderRecord) {
  return {
    id: o.id,
    customer_id: o.customerId,
    status: o.status,
    total_cents: o.totalCents,
    currency: o.currency,
    lines: o.lines.map((l) => ({ sku: l.sku, qty: l.qty, unit_cents: l.unitCents })),
    placed_at: o.placedAt.toISOString(),
  };
}
