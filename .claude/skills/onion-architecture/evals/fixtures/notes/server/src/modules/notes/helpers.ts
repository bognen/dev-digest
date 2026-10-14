import type { NoteRecord } from './types.js';
import { NOTE_URL_PREFIX } from './constants.js';

export function toNoteDto(n: NoteRecord) {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    url: NOTE_URL_PREFIX + n.id,
    created_at: n.createdAt.toISOString(),
  };
}
