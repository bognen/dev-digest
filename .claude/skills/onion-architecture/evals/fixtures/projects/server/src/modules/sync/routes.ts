import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { SyncService } from './service.js';

const IdParams = z.object({ id: z.string().uuid() });

export async function syncRoutes(app: FastifyInstance) {
  const service = new SyncService({
    tracker: app.container.tracker,
    projects: { get: (workspaceId, id) => app.container.projectsService.get(workspaceId, id) },
    log: app.log,
  });

  app.post('/projects/:id/sync', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id } = req.params as z.infer<typeof IdParams>;
    return service.pull(workspaceId, id);
  });
}
