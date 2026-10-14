import type { SearchHit, SearchIndex } from '../vendor/shared/adapters.js';

export class MockSearchIndex implements SearchIndex {
  docs = new Map<string, string>();

  async query(_workspaceId: string, text: string, limit: number): Promise<SearchHit[]> {
    return [...this.docs.entries()]
      .filter(([, doc]) => doc.includes(text))
      .slice(0, limit)
      .map(([id]) => ({ id, score: 1 }));
  }

  async upsert(_workspaceId: string, id: string, text: string): Promise<void> {
    this.docs.set(id, text);
  }
}
