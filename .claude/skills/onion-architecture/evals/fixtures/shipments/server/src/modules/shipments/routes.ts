import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { ShipmentsService } from './service.js';
import { toShipmentDto } from './helpers.js';

const IdParams = z.object({ id: z.string().uuid() });

export async function shipmentsRoutes(app: FastifyInstance) {
  const service = new ShipmentsService({
    repo: app.container.shipmentsRepo,
    db: app.container.db,
    carrier: () => app.container.carrier(),
  });

  app.get('/shipments/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id } = req.params as z.infer<typeof IdParams>;
    return toShipmentDto(await service.get(workspaceId, id));
  });

  app.post('/shipments/:id/refresh', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id } = req.params as z.infer<typeof IdParams>;
    return toShipmentDto(await service.refresh(workspaceId, id));
  });

  app.get('/shipments/:id/events', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id } = req.params as z.infer<typeof IdParams>;
    const shipment = await service.get(workspaceId, id);
    const carrier = await app.container.carrier();
    const events = await carrier.track(shipment.trackingNumber);
    return events.map((e) => ({ code: e.code, at: e.at.toISOString() }));
  });
}
