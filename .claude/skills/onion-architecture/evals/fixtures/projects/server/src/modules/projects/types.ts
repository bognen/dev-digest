export interface ProjectRecord {
  id: string;
  workspaceId: string;
  name: string;
  archived: boolean;
  touchedAt: Date;
}

export interface TaskRecord {
  id: string;
  projectId: string;
  title: string;
  status: string;
}

export interface ProjectsRepo {
  list(workspaceId: string, limit: number): Promise<ProjectRecord[]>;
  getById(workspaceId: string, id: string): Promise<ProjectRecord | undefined>;
  listTasks(workspaceId: string, projectId: string): Promise<TaskRecord[]>;
  archive(workspaceId: string, id: string, tx?: unknown): Promise<void>;
  reassignTasks(workspaceId: string, fromId: string, toId: string, tx?: unknown): Promise<void>;
}

export interface TransactionRunner {
  run<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}
