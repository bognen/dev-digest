export interface CatalogItem {
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  priceCents: number;
  published: boolean;
}

export interface CatalogRepo {
  list(workspaceId: string, limit: number, offset: number): Promise<CatalogItem[]>;
  getById(workspaceId: string, id: string): Promise<CatalogItem | undefined>;
  getMany(workspaceId: string, ids: string[]): Promise<CatalogItem[]>;
}
