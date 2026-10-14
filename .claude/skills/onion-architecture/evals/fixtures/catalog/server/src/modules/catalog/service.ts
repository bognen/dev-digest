import { CatalogListResponse } from '@devdigest/shared';
import { ElasticSearchIndex } from '../../adapters/index.js';
import { ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import type { Logger } from '../../platform/logger.js';
import type { PriceQuote } from '../pricing/index.js';
import { CatalogRepository } from './repository.js';
import { PAGE_SIZE } from './constants.js';
import { bySearchOrder, toItemDto } from './helpers.js';
import type { CatalogItem } from './types.js';

export interface CatalogServiceDeps {
  repo: CatalogRepository;
  searchUrl: string;
  searchKey: string;
  log: Logger;
}

export class CatalogService {
  private index: ElasticSearchIndex;

  constructor(private deps: CatalogServiceDeps) {
    this.index = new ElasticSearchIndex(deps.searchUrl, deps.searchKey);
  }

  async get(workspaceId: string, id: string): Promise<CatalogItem> {
    const item = await this.deps.repo.getById(workspaceId, id);
    if (!item) throw new NotFoundError('Product not found');
    return item;
  }

  async page(workspaceId: string, page: number) {
    const items = await this.deps.repo.list(workspaceId, PAGE_SIZE, page * PAGE_SIZE);
    return CatalogListResponse.parse({ items: items.map(toItemDto), page, page_size: PAGE_SIZE });
  }

  async search(workspaceId: string, text: string): Promise<CatalogItem[]> {
    const hits = await this.index.query(workspaceId, text, PAGE_SIZE).catch((err) => {
      this.deps.log.warn({ err }, 'search failed');
      throw new ExternalServiceError('Search unavailable');
    });
    const ids = hits.map((h) => h.id);
    return (await this.deps.repo.getMany(workspaceId, ids)).sort(bySearchOrder(ids));
  }

  quoteFor(item: CatalogItem): PriceQuote {
    return { sku: item.slug, amountCents: item.priceCents, currency: 'USD' };
  }
}
