import type { PaymentMethod } from '@devdigest/shared';
import type { ChargeRecord } from './types.js';

export function discountedAmount(amountCents: number, method: PaymentMethod): number {
  return method === 'bank_transfer' ? Math.floor(amountCents * 0.98) : amountCents;
}

export function toChargeDto(c: ChargeRecord) {
  return {
    id: c.id,
    invoice_id: c.invoiceId,
    amount_cents: c.amountCents,
    method: c.method,
    external_ref: c.externalRef,
    created_at: c.createdAt.toISOString(),
  };
}
