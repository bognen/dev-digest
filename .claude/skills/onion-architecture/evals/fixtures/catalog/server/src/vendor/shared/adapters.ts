export interface SearchHit {
  id: string;
  score: number;
}

export interface SearchIndex {
  query(workspaceId: string, text: string, limit: number): Promise<SearchHit[]>;
  upsert(workspaceId: string, id: string, text: string): Promise<void>;
}
