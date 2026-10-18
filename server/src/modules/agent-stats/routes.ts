import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { StatsRangeQuery } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { AgentStatsRepository } from './repository.js';
import { AgentStatsService } from './service.js';

/**
 * Agent stats routes — read-only aggregates over stored runs and findings.
 *   GET /agents/:id/stats?from&to   → AgentStats       (agent Stats tab)
 *   GET /agent-performance?from&to  → AgentPerformance (global dashboard)
 * Both take a half-open ISO range `[from, to)` and share one aggregation.
 */
export default async function agentStatsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new AgentStatsService(new AgentStatsRepository(container.db));
  const toRange = (q: StatsRangeQuery) => ({ from: new Date(q.from), to: new Date(q.to) });

  app.get(
    '/agents/:id/stats',
    { schema: { params: IdParams, querystring: StatsRangeQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const stats = await service.agentStats(workspaceId, req.params.id, toRange(req.query));
      if (!stats) throw new NotFoundError('Agent not found');
      return stats;
    },
  );

  app.get('/agent-performance', { schema: { querystring: StatsRangeQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.performance(workspaceId, toRange(req.query));
  });
}
