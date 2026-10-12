import type { PaymentMethod } from '@devdigest/shared';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';
import { roundToCents } from '../ledger/helpers.js';
import { BillingRepository } from './repository.js';
import { discountedAmount } from './helpers.js';
import type { ChargeRecord, PaymentGateway } from './types.js';

export interface BillingServiceDeps {
  repo: BillingRepository;
  gateway: PaymentGateway;
}

export class BillingService {
  constructor(private deps: BillingServiceDeps) {}

  async listCharges(workspaceId: string, invoiceId: string): Promise<ChargeRecord[]> {
    return this.deps.repo.listForInvoice(workspaceId, invoiceId);
  }

  async charge(
    workspaceId: string,
    invoiceId: string,
    baseCents: number,
    method: PaymentMethod,
  ): Promise<ChargeRecord> {
    if (baseCents <= 0) throw new ValidationError('Amount must be positive');
    const amountCents = Math.round(roundToCents(discountedAmount(baseCents, method) / 100) * 100);
    const { externalRef } = await this.deps.gateway
      .charge({ invoiceId, amountCents, method })
      .catch(() => {
        throw new ExternalServiceError('Payment gateway unavailable');
      });
    return this.deps.repo.insert(workspaceId, { invoiceId, amountCents, method, externalRef });
  }
}
