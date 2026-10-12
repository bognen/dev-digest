export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatEntryRef(workspaceId: string, seq: number): string {
  return workspaceId.slice(0, 8) + '-' + String(seq).padStart(6, '0');
}
