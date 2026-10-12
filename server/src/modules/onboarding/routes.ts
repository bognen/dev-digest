import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * SPEC-02 Onboarding Tour routes.
 *
 *   GET  /repos/:id/onboarding           -> OnboardingTourState (0 LLM calls, never generates)
 *   POST /repos/:id/onboarding/generate  -> OnboardingTourState (generate / regenerate; 409 if running)
 *
 * Both resolve the repo through a workspace-scoped lookup first, so a repo in
 * another workspace is a 404 before anything else is read.
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.onboardingService;

  app.get('/repos/:id/onboarding', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getState(workspaceId, req.params.id);
  });

  app.post('/repos/:id/onboarding/generate', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.generate(workspaceId, req.params.id);
  });
}
