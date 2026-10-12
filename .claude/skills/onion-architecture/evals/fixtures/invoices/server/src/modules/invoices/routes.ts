import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { InvoicesService } from './service.js';

const IdParams = z.object({ id: z.string().uuid() });
const StatusBody = z.object({ status: z.enum(['draft', 'sent', 'paid', 'void']) });

export async function invoicesRoutes(app: FastifyInstance) {
  const service = new InvoicesService({
    invoices: app.container.invoicesRepo,
    customers: app.container.customersRepo,
  });

  app.get('/invoices/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id } = req.params as z.infer<typeof IdParams>;
    return service.getWithCustomer(workspaceId, id, reply);
  });

  app.patch('/invoices/:id/status', { schema: { params: IdParams, body: StatusBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id } = req.params as z.infer<typeof IdParams>;
    const { status } = req.body as z.infer<typeof StatusBody>;
    await service.changeStatus(workspaceId, id, status);
    return reply.code(204).send();
  });
}
