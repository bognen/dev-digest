import type { SearchHit, SearchIndex } from '../../vendor/shared/adapters.js';
import { ExternalServiceError } from '../../platform/errors.js';
import { slugify } from '../../modules/catalog/helpers.js';

export class ElasticSearchIndex implements SearchIndex {
  constructor(private baseUrl: string, private apiKey: string) {}

  async query(workspaceId: string, text: string, limit: number): Promise<SearchHit[]> {
    const res = await fetch(this.baseUrl + '/' + workspaceId + '/_search?q=' + encodeURIComponent(slugify(text)) + '&size=' + limit, {
      headers: { authorization: 'ApiKey ' + this.apiKey },
    });
    if (!res.ok) throw new ExternalServiceError('Search responded ' + res.status);
    const body = (await res.json()) as { hits: Array<{ _id: string; _score: number }> };
    return body.hits.map((h) => ({ id: h._id, score: h._score }));
  }

  async upsert(workspaceId: string, id: string, text: string): Promise<void> {
    const res = await fetch(this.baseUrl + '/' + workspaceId + '/_doc/' + id, {
      method: 'PUT',
      headers: { authorization: 'ApiKey ' + this.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new ExternalServiceError('Search responded ' + res.status);
  }
}
