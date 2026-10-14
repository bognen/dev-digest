export interface TagRecord {
  id: string;
  repoId: string;
  label: string;
  color: string;
  usageCount: number;
}

export interface TagsRepo {
  listForRepo(repoId: string): Promise<TagRecord[]>;
  upsert(repoId: string, label: string, color: string): Promise<TagRecord>;
  bumpUsage(id: string): Promise<void>;
}
