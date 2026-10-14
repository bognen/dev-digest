import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { NotesRepository } from './repository.js';
import type { NoteRecord } from './types.js';

export class NotesService {
  private repo: NotesRepository;

  constructor(private container: Container) {
    this.repo = new NotesRepository(container.db);
  }

  async get(workspaceId: string, id: string): Promise<NoteRecord> {
    const note = await this.repo.getById(workspaceId, id);
    if (!note) throw new NotFoundError('Note not found');
    return note;
  }

  async create(workspaceId: string, title: string, body: string): Promise<NoteRecord> {
    const note = await this.repo.insert(workspaceId, title, body);
    await this.container.notifier().announce(note.title, note.id);
    return note;
  }
}
