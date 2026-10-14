import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvalCaseUpsert, EvalOwnerKind, StartEvalRunBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { DEFAULT_PERIOD_DAYS } from './constants.js';

/**
 * SPEC-06 eval pipeline routes. Every handler: getContext (workspace) → one
 * service call; ownership/workspace checks live in the service.
 *
 *   POST   /findings/:id/eval-case            → CreateCaseFromFindingResult (201 new / 200 existing)
 *   GET    /eval/cases?owner_kind&owner_id     → EvalCaseDetail[]
 *   GET    /eval/cases/sources                 → string[] (finding ids that have a case)
 *   POST   /eval/cases                         → EvalCaseDetail (201)
 *   GET    /eval/cases/:id                     → EvalCaseDetail
 *   PUT    /eval/cases/:id                     → EvalCaseDetail
 *   DELETE /eval/cases/:id                     → { ok }
 *   POST   /eval/cases/:id/run                 → EvalSuiteRun (202, scope 'case')
 *   POST   /agents/:id/eval-runs               → EvalSuiteRun (202)
 *   POST   /skills/:id/eval-runs               → EvalSuiteRun (202) { host_agent_id? }
 *   GET    /eval/runs?owner_kind&owner_id&days → EvalSuiteRun[] (full runs, newest first)
 *   GET    /eval/runs/:id                      → EvalSuiteRunDetail
 *   POST   /eval/runs/:id/promote              → PromoteResult
 *   GET    /eval/overview                      → EvalOverview
 *   GET    /eval/dashboard/:ownerKind/:ownerId?days → EvalOwnerDashboard
 *   POST   /eval/run-all                       → RunAllResult
 */

const OwnerQuery = z.object({ owner_kind: EvalOwnerKind, owner_id: z.string().uuid() });
const PeriodQuery = z.object({ days: z.coerce.number().int().min(0).max(3650).default(DEFAULT_PERIOD_DAYS) });
const OwnerParams = z.object({ ownerKind: EvalOwnerKind, ownerId: z.string().uuid() });

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.evalService;

  app.post('/findings/:id/eval-case', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const result = await service.createFromFinding(workspaceId, req.params.id);
    reply.status(result.created ? 201 : 200);
    return result;
  });

  app.get('/eval/cases', { schema: { querystring: OwnerQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listCases(workspaceId, req.query.owner_kind, req.query.owner_id);
  });

  app.get('/eval/cases/sources', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.sourceFindingIds(workspaceId);
  });

  app.post('/eval/cases', { schema: { body: EvalCaseUpsert } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const created = await service.createCase(workspaceId, req.body);
    reply.status(201);
    return created;
  });

  app.get('/eval/cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getCase(workspaceId, req.params.id);
  });

  app.put('/eval/cases/:id', { schema: { params: IdParams, body: EvalCaseUpsert } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.updateCase(workspaceId, req.params.id, req.body);
  });

  app.delete('/eval/cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.deleteCase(workspaceId, req.params.id);
    return { ok: true };
  });

  app.post(
    '/eval/cases/:id/run',
    { schema: { params: IdParams, body: StartEvalRunBody.nullish() } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const run = await service.runCase(workspaceId, req.params.id, req.body?.host_agent_id);
      reply.status(202);
      return run;
    },
  );

  app.post('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const run = await service.startAgentRun(workspaceId, req.params.id);
    reply.status(202);
    return run;
  });

  app.post(
    '/skills/:id/eval-runs',
    { schema: { params: IdParams, body: StartEvalRunBody.nullish() } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const run = await service.startSkillRun(workspaceId, req.params.id, req.body?.host_agent_id);
      reply.status(202);
      return run;
    },
  );

  app.get('/eval/runs', { schema: { querystring: OwnerQuery.merge(PeriodQuery) } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId, req.query.owner_kind, req.query.owner_id, req.query.days);
  });

  app.get('/eval/runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getRun(workspaceId, req.params.id);
  });

  app.post('/eval/runs/:id/promote', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.promote(workspaceId, req.params.id);
  });

  app.get('/eval/overview', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.overview(workspaceId);
  });

  app.get(
    '/eval/dashboard/:ownerKind/:ownerId',
    { schema: { params: OwnerParams, querystring: PeriodQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.dashboard(workspaceId, req.params.ownerKind, req.params.ownerId, req.query.days);
    },
  );

  app.post('/eval/run-all', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.runAll(workspaceId);
  });
}
