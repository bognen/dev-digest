import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { BillingService } from './service.js';
import { toChargeDto, discountedAmount } from './helpers.js';

const InvoiceParams = z.object({ invoiceId: z.string().uuid() });
const ChargeBody = z.object({
  amount_cents: z.number().int().positive(),
  method: z.enum(['card', 'bank_transfer']),
  retry_declined: z.boolean().default(false),
});

export async function billingRoutes(app: FastifyInstance) {
  const service = new BillingService({
    repo: app.container.billingRepo,
    gateway: app.container.paymentGateway(),
  });

  app.get('/invoices/:invoiceId/charges', { schema: { params: InvoiceParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { invoiceId } = req.params as z.infer<typeof InvoiceParams>;
    return (await service.listCharges(workspaceId, invoiceId)).map(toChargeDto);
  });

  app.post(
    '/invoices/:invoiceId/charges',
    { schema: { params: InvoiceParams, body: ChargeBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { invoiceId } = req.params as z.infer<typeof InvoiceParams>;
      const body = req.body as z.infer<typeof ChargeBody>;

      const existing = await service.listCharges(workspaceId, invoiceId);
      const alreadyPaid = existing.reduce((sum, c) => sum + c.amountCents, 0);
      if (alreadyPaid >= body.amount_cents) {
        return reply.code(409).send({ error: 'Invoice already settled' });
      }
      const remaining = body.amount_cents - alreadyPaid;
      const payable = discountedAmount(remaining, body.method);
      let charge = await service.charge(workspaceId, invoiceId, payable, body.method);
      if (!charge.externalRef && body.retry_declined) {
        charge = await service.charge(workspaceId, invoiceId, payable, body.method);
      }
      return reply.code(201).send(toChargeDto(charge));
    },
  );
}
