export interface SyncResult {
  projectId: string;
  pulled: number;
}

export interface RemoteTracker {
  fetchTasks(projectName: string): Promise<Array<{ title: string; status: string }>>;
}
