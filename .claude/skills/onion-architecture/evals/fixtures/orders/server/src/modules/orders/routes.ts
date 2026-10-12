import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { OrdersService } from './service.js';
import { toOrderDto } from './helpers.js';

const IdParams = z.object({ id: z.string().uuid() });
const PlaceBody = z.object({
  customer_id: z.string().uuid(),
  currency: z.enum(['USD', 'EUR', 'GBP']),
  line_items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive(), unit_cents: z.number().int().nonnegative() })),
});

export async function ordersRoutes(app: FastifyInstance) {
  const service = new OrdersService({
    repo: app.container.ordersRepo,
    inventory: app.container.inventoryService,
    log: app.log,
  });

  app.get('/orders/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id } = req.params as z.infer<typeof IdParams>;
    return toOrderDto(await service.get(workspaceId, id));
  });

  app.post('/orders', { schema: { body: PlaceBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = req.body as z.infer<typeof PlaceBody>;
    const order = await service.place(workspaceId, body);
    return reply.code(201).send(toOrderDto(order));
  });
}
