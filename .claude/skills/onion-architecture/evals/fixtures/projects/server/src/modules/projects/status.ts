export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done';

export function isOpen(status: string): boolean {
  return status !== 'done';
}
