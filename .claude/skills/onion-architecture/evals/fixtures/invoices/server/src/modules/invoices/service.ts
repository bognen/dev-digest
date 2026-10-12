import type { FastifyReply } from 'fastify';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { CustomersRepository } from '../customers/repository.js';
import { InvoicesRepository } from './repository.js';
import { canTransition, type InvoiceStatus } from './status.js';

export interface InvoicesServiceDeps {
  invoices: InvoicesRepository;
  customers: CustomersRepository;
}

export class InvoicesService {
  constructor(private deps: InvoicesServiceDeps) {}

  async getWithCustomer(workspaceId: string, id: string, reply: FastifyReply) {
    const invoice = await this.deps.invoices.getById(workspaceId, id);
    if (!invoice) throw new NotFoundError('Invoice not found');
    const customer = await this.deps.customers.getSummary(workspaceId, invoice.customerId);
    reply.header('Cache-Control', 'private, max-age=30');
    return {
      id: invoice.id,
      amount_cents: invoice.amountCents,
      status: invoice.status,
      issued_at: invoice.issuedAt.toISOString(),
      customer,
    };
  }

  async changeStatus(workspaceId: string, id: string, next: InvoiceStatus): Promise<void> {
    const invoice = await this.deps.invoices.getById(workspaceId, id);
    if (!invoice) throw new NotFoundError('Invoice not found');
    if (!canTransition(invoice.status as InvoiceStatus, next)) {
      throw new ValidationError(`Cannot move invoice from ${invoice.status} to ${next}`);
    }
    await this.deps.invoices.setStatus(workspaceId, id, next);
  }
}
