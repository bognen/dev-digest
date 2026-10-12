import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ContextRepoQuery, ProjectDocQuery, SetContextDocsBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * SPEC-01 Project Context routes. Every handler: getContext (workspace) -> one
 * service call. Ownership of repo/agent/skill is enforced in the service.
 *
 *   GET  /repos/:id/context                 -> ProjectDocList
 *   GET  /repos/:id/context/file?path=      -> ProjectDocContent
 *   POST /repos/:id/context/refresh         -> ProjectDocList (sync, rate-limited)
 *   GET  /agents/:id/context?repo_id=       -> AgentContextState
 *   PUT  /agents/:id/context                -> AgentContextState (replaces ordered list)
 *   GET  /skills/:id/context?repo_id=       -> SkillContextState
 *   PUT  /skills/:id/context                -> SkillContextState
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.projectContextService;

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: ProjectDocQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getDoc(workspaceId, req.params.id, req.query.path);
    },
  );

  app.post(
    '/repos/:id/context/refresh',
    {
      schema: { params: IdParams },
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.refresh(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/context',
    { schema: { params: IdParams, querystring: ContextRepoQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getAgentContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: SetContextDocsBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setAgentContext(workspaceId, req.params.id, req.body.repo_id, req.body.paths);
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams, querystring: ContextRepoQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getSkillContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: SetContextDocsBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setSkillContext(workspaceId, req.params.id, req.body.repo_id, req.body.paths);
    },
  );
}
