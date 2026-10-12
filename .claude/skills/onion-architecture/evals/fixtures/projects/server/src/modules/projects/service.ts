import type { Db } from '../../db/client.js';
import type { Logger } from '../../platform/logger.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { ProjectsRepository } from './repository.js';
import { clampLimit } from './helpers.js';
import { isOpen } from './status.js';
import type { ProjectRecord, TaskRecord } from './types.js';

export const PROJECT_PAGE_LIMIT = 50;

export interface ProjectsServiceDeps {
  repo: ProjectsRepository;
  db: Db;
  log: Logger;
}

export class ProjectsService {
  constructor(private deps: ProjectsServiceDeps) {}

  async list(workspaceId: string, limit?: number): Promise<ProjectRecord[]> {
    return this.deps.repo.list(workspaceId, clampLimit(limit));
  }

  async get(workspaceId: string, id: string): Promise<ProjectRecord> {
    const project = await this.deps.repo.getById(workspaceId, id);
    if (!project) throw new NotFoundError('Project not found');
    return project;
  }

  async listTasks(workspaceId: string, id: string): Promise<TaskRecord[]> {
    await this.get(workspaceId, id);
    return this.deps.repo.listTasks(workspaceId, id);
  }

  async merge(workspaceId: string, fromId: string, toId: string): Promise<void> {
    if (fromId === toId) throw new ValidationError('Cannot merge a project into itself');
    await this.get(workspaceId, fromId);
    await this.get(workspaceId, toId);
    const open = (await this.deps.repo.listTasks(workspaceId, fromId)).filter((task) => isOpen(task.status));
    this.deps.log.info({ workspaceId, fromId, toId, open: open.length }, 'merging projects');
    await this.deps.db.transaction(async (tx) => {
      await this.deps.repo.reassignTasks(workspaceId, fromId, toId, tx);
      await this.deps.repo.archive(workspaceId, fromId, tx);
    });
  }
}
