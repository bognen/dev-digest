import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CiInstallInput, CiPreviewInput, CiRemoveInput, CiZipInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * SPEC-07 CI routes. Every handler: getContext (workspace) -> one service call.
 * No route accepts a run result (AC-43): runs are pulled by `/ci/refresh` only.
 *
 *   POST /agents/:id/ci/preview                              -> CiPreview
 *   GET  /agents/:id/ci/secrets?repo_id                      -> CiSecretsStatus
 *   POST /agents/:id/ci/install                              -> CiInstallResult
 *   POST /agents/:id/ci/zip                                  -> application/zip bytes
 *   POST /agents/:id/ci/installations/:installationId/remove -> CiRemoveResult
 *   GET  /agents/:id/ci                                      -> CiAgentOverview
 *   GET  /ci/runs                                            -> CiRun[]
 *   POST /ci/refresh                                         -> CiRefreshResult
 */

const SecretsQuery = z.object({ repo_id: z.string().uuid() });
const RemoveParams = z.object({ id: z.string().uuid(), installationId: z.string().uuid() });

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.ciService;

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiPreviewInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/ci/secrets',
    { schema: { params: IdParams, querystring: SecretsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.secrets(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.post(
    '/agents/:id/ci/install',
    { schema: { params: IdParams, body: CiInstallInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.install(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/ci/zip',
    { schema: { params: IdParams, body: CiZipInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const bytes = await service.zip(workspaceId, req.params.id, req.body);
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', 'attachment; filename="devdigest-ci.zip"')
        .header('cache-control', 'no-store')
        .send(Buffer.from(bytes));
    },
  );

  app.post(
    '/agents/:id/ci/installations/:installationId/remove',
    { schema: { params: RemoveParams, body: CiRemoveInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.remove(workspaceId, req.params.id, req.params.installationId, req.body);
    },
  );

  app.get('/agents/:id/ci', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.overview(workspaceId, req.params.id);
  });

  app.get('/ci/runs', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId);
  });

  app.post('/ci/refresh', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.refresh(workspaceId);
  });
}
