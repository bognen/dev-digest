import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ValidationError } from '../../platform/errors.js';
import { TagsService } from './service.js';

const RepoParams = z.object({ repoId: z.string().uuid() });
const ImportBody = z.object({ owner: z.string().min(1), name: z.string().min(1) });
const TagBody = z.object({ label: z.string().min(1).max(40), color: z.string().regex(/^#[0-9a-f]{6}$/i) });

export async function tagsRoutes(app: FastifyInstance) {
  const service = new TagsService({
    repo: app.container.tagsRepo,
    log: app.log,
    githubToken: app.container.config.githubToken,
  });

  app.get('/repos/:repoId/tags', { schema: { params: RepoParams } }, async (req) => {
    const { repoId } = req.params as z.infer<typeof RepoParams>;
    const tags = await service.list(repoId);
    return tags.map((t) => ({ id: t.id, label: t.label, color: t.color, usage_count: t.usageCount }));
  });

  app.post('/repos/:repoId/tags', { schema: { params: RepoParams } }, async (req, reply) => {
    const { repoId } = req.params as z.infer<typeof RepoParams>;
    const parsed = TagBody.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid tag');
    const tag = await service.create(repoId, parsed.data.label, parsed.data.color);
    return reply.code(201).send(tag);
  });

  app.post('/repos/:repoId/tags/import', { schema: { params: RepoParams, body: ImportBody } }, async (req) => {
    const { repoId } = req.params as z.infer<typeof RepoParams>;
    const { owner, name } = req.body as z.infer<typeof ImportBody>;
    return service.importFromGitHub(repoId, owner, name);
  });
}
