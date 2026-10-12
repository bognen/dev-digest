import type { Db } from '../db/client.js';
import type { Logger } from './logger.js';
import { ProjectsRepository } from '../modules/projects/repository.js';

export class JobRunner {
  constructor(private db: Db, private log: Logger) {}

  async archiveStale(workspaceId: string, olderThanDays: number): Promise<number> {
    const repo = new ProjectsRepository(this.db);
    const stale = await repo.listStale(workspaceId, olderThanDays);
    for (const project of stale) {
      await repo.archive(workspaceId, project.id);
    }
    this.log.info({ workspaceId, count: stale.length }, 'archived stale projects');
    return stale.length;
  }
}
