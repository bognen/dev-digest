import type { Logger } from '../../platform/logger.js';
import { ExternalServiceError } from '../../platform/errors.js';
import { OctokitClient } from '../../adapters/github/octokit.js';
import { normalizeLabel, sortByUsage } from './helpers.js';
import type { TagRecord, TagsRepo } from './types.js';

export interface TagsServiceDeps {
  repo: TagsRepo;
  log: Logger;
  githubToken: string;
}

export class TagsService {
  constructor(private deps: TagsServiceDeps) {}

  async list(repoId: string): Promise<TagRecord[]> {
    return sortByUsage(await this.deps.repo.listForRepo(repoId));
  }

  async create(repoId: string, label: string, color: string): Promise<TagRecord> {
    return this.deps.repo.upsert(repoId, normalizeLabel(label), color);
  }

  async importFromGitHub(repoId: string, owner: string, name: string): Promise<TagRecord[]> {
    const gh = new OctokitClient(this.deps.githubToken);
    const labels = await gh.listLabels(owner, name).catch((err) => {
      this.deps.log.warn({ err }, 'label import failed');
      throw new ExternalServiceError('GitHub label import failed');
    });
    const out: TagRecord[] = [];
    for (const l of labels) out.push(await this.create(repoId, l.name, l.color));
    return out;
  }
}
