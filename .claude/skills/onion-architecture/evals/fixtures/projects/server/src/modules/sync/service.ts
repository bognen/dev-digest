import type { ProjectRecord } from '../projects/index.js';
import { ExternalServiceError } from '../../platform/errors.js';
import type { Logger } from '../../platform/logger.js';
import type { RemoteTracker, SyncResult } from './types.js';

export interface SyncServiceDeps {
  tracker: RemoteTracker;
  projects: { get(workspaceId: string, id: string): Promise<ProjectRecord> };
  log: Logger;
}

export class SyncService {
  constructor(private deps: SyncServiceDeps) {}

  async pull(workspaceId: string, projectId: string): Promise<SyncResult> {
    const project = await this.deps.projects.get(workspaceId, projectId);
    const { ProjectsService } = await import('../projects/service.js');
    this.deps.log.info({ workspaceId, projectId: project.id, svc: typeof ProjectsService }, 'pulling tasks');
    const remote = await this.deps.tracker.fetchTasks(project.name).catch(() => {
      throw new ExternalServiceError('Tracker unavailable');
    });
    return { projectId: project.id, pulled: remote.length };
  }
}
