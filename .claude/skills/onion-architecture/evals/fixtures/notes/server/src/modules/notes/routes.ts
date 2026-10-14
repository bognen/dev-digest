import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { NotesService } from './service.js';
import { toNoteDto } from './helpers.js';
import { DEFAULT_PAGE_SIZE, MAX_TITLE_LENGTH } from './constants.js';

const IdParams = z.object({ id: z.string().uuid() });
const CreateBody = z.object({ title: z.string().min(1).max(MAX_TITLE_LENGTH), body: z.string() });

export async function notesRoutes(app: FastifyInstance) {
  const service = new NotesService(app.container);

  app.get('/notes', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const rows = await app.container.db
      .select()
      .from(t.notes)
      .where(eq(t.notes.workspaceId, workspaceId))
      .orderBy(desc(t.notes.createdAt))
      .limit(DEFAULT_PAGE_SIZE);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      created_at: r.createdAt.toISOString(),
    }));
  });

  app.get('/notes/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id } = req.params as z.infer<typeof IdParams>;
    return toNoteDto(await service.get(workspaceId, id));
  });

  app.post('/notes', { schema: { body: CreateBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const { title, body } = req.body as z.infer<typeof CreateBody>;
    const note = await service.create(workspaceId, title, body);
    return reply.code(201).send(toNoteDto(note));
  });
}
