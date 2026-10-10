import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrMeta, PrDetail, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput, SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { createPullsService } from './index.js';

/**
 * F1 — pulls module. PR import via Octokit (list + per-PR detail).
 *   GET /repos/:id/pulls → list PRs for a repo (open + recently merged/closed,
 *                          synced from GitHub, persisted). `status` is GitHub's
 *                          merge state (open/merged/closed).
 *   GET /pulls/:id       → full PR detail (diff/files, commits, body, linked issue)
 *   GET /pulls/:id/smart-diff → files grouped by role (core/tests/wiring/docs/
 *                          boilerplate) with open-finding lines + split suggestion;
 *                          DB-only (persisted pr_files + latest-per-agent findings)
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by A2 — this module only imports/reads.
 *
 * Persistence/business logic lives in `./service.ts` + `./repository.ts`
 * (onion architecture — see `.claude/skills/onion-architecture`); this file
 * only validates, calls one service method, and returns.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = createPullsService(container);

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    return service.listForRepo(workspaceId, req.params.id, req.log);
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    return service.getDetail(workspaceId, req.params.id, req.log);
  });

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req): Promise<SmartDiffResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.getSmartDiff(workspaceId, req.params.id);
    },
  );

  // ---- Inline review comments (Files changed tab) -------------------------
  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listComments(workspaceId, req.params.id, req.log);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      return service.postComment(workspaceId, req.params.id, req.body);
    },
  );
}
