import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * specs/11-why-risk-brief.md + specs/2026-10-11-pr-brief-contract-gaps.md —
 * PR Why + Risk Brief routes.
 *
 *   GET  /pulls/:id/brief            → BriefPage            (0 LLM calls: AC-23)
 *   POST /pulls/:id/brief            → BriefGenerateResult  (canonical)
 *   POST /pulls/:id/brief/generate   → BriefGenerateResult  (permanent alias)
 *
 * One handler, two paths — the spec's Flow diagram treats "Regenerate" as the
 * same action (AC-26), distinguished only by the `regenerate` body flag. The
 * body is optional: an absent body means `regenerate: false`. Both paths
 * resolve the singleton `container.briefService` (shared in-flight guard),
 * which itself resolves the PR via a workspace-scoped `BriefRepository.getPull`
 * FIRST — a PR in another workspace 404s before any `pr_brief` row is ever
 * read (AC-44), on either path.
 */

// Fastify hands an absent body (no payload / no content-type) to the validator as
// `null`, which `.default({})` does not catch (it only handles undefined). Coalesce
// null/undefined to `{}` first; the object schema then yields `regenerate: false`.
const GenerateBriefBody = z.preprocess(
  (v) => v ?? {},
  z.object({ regenerate: z.boolean().optional().default(false) }),
);

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.briefService;

  app.get('/pulls/:id/brief', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const page = await service.getPage(workspaceId, req.params.id);
    if (!page) throw new NotFoundError('Pull request not found');
    return page;
  });

  // One handler body, registered on the canonical path and the permanent alias.
  // Looping (vs. a standalone function) keeps req typed by the Zod provider.
  for (const path of ['/pulls/:id/brief', '/pulls/:id/brief/generate'] as const) {
    app.post(path, { schema: { params: IdParams, body: GenerateBriefBody } }, async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id, req.body.regenerate);
    });
  }
}
