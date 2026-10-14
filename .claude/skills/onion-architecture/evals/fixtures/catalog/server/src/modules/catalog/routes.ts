import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ValidationError } from '../../platform/errors.js';
import { getContext } from '../_shared/context.js';
import { CatalogService } from './service.js';
import { toItemDto } from './helpers.js';
import { MAX_QUERY_LENGTH, UUID_RE } from './constants.js';

const PageQuery = z.object({ page: z.coerce.number().int().min(0).default(0) });
const SearchQuery = z.object({ q: z.string().min(1).max(MAX_QUERY_LENGTH) });

export async function catalogRoutes(app: FastifyInstance) {
  const service = new CatalogService({
    repo: app.container.catalogRepo,
    searchUrl: app.container.config.searchUrl,
    searchKey: app.container.config.searchKey,
    log: app.log,
  });

  app.get('/catalog', { schema: { querystring: PageQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { page } = req.query as z.infer<typeof PageQuery>;
    return service.page(workspaceId, page);
  });

  app.get('/catalog/search', { schema: { querystring: SearchQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { q } = req.query as z.infer<typeof SearchQuery>;
    return (await service.search(workspaceId, q)).map(toItemDto);
  });

  app.get('/catalog/:id', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const id = (req.params as { id?: string }).id;
    if (typeof id !== 'string' || !UUID_RE.test(id)) throw new ValidationError('Invalid product id');
    return toItemDto(await service.get(workspaceId, id));
  });
}
