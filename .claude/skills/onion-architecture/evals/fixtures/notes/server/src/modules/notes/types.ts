export interface NoteRecord {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  createdAt: Date;
}

export interface NotesRepo {
  list(workspaceId: string, limit: number): Promise<NoteRecord[]>;
  getById(workspaceId: string, id: string): Promise<NoteRecord | undefined>;
  insert(workspaceId: string, title: string, body: string): Promise<NoteRecord>;
}
