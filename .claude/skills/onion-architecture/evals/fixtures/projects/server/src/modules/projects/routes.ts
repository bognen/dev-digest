import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { ProjectsService } from './service.js';
import { toProjectDto } from './helpers.js';

const IdParams = z.object({ id: z.string().uuid() });
const ListQuery = z.object({ limit: z.coerce.number().int().optional() });
const MergeBody = z.object({ into: z.string().uuid() });

export async function projectsRoutes(app: FastifyInstance) {
  const service = new ProjectsService({
    repo: app.container.projectsRepo,
    db: app.container.db,
    log: app.log,
  });

  app.get('/projects', { schema: { querystring: ListQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { limit } = req.query as z.infer<typeof ListQuery>;
    return (await service.list(workspaceId, limit)).map(toProjectDto);
  });

  app.get('/projects/:id/progress', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id } = req.params as z.infer<typeof IdParams>;
    const tasks = await service.listTasks(workspaceId, id);
    const done = tasks.filter((t) => t.status === 'done').length;
    const blocked = tasks.filter((t) => t.status === 'blocked').length;
    const pct = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);
    const health = blocked > 2 ? 'at_risk' : pct >= 80 ? 'on_track' : 'in_progress';
    return { project_id: id, total: tasks.length, done, blocked, percent_done: pct, health };
  });

  app.post('/projects/:id/merge', { schema: { params: IdParams, body: MergeBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id } = req.params as z.infer<typeof IdParams>;
    const { into } = req.body as z.infer<typeof MergeBody>;
    await service.merge(workspaceId, id, into);
    return reply.code(204).send();
  });
}
