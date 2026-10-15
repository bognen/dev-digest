import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RunnerError } from './errors.js';

/**
 * Reads the OPT-IN exported memory file `<agentDir>/memory.jsonl` (A5). One JSON
 * object per line: `{"kind","scope","content"}`. The `content` strings are
 * passed to reviewer-core as `memory`. A missing file is normal (memory export
 * is off by default) and yields `[]`; a malformed line hard-fails.
 */
export function loadMemory(
  agentDir: string,
  readFile: typeof readFileSync = readFileSync,
): string[] {
  const file = path.join(agentDir, 'memory.jsonl');
  let raw: string;
  try {
    raw = readFile(file, 'utf8') as unknown as string;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new RunnerError(`Cannot read memory file at ${file}: ${(err as Error).message}`);
  }
  const items: string[] = [];
  raw.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new RunnerError(`Memory file ${file} line ${i + 1} is not valid JSON`);
    }
    const content = (parsed as { content?: unknown } | null)?.content;
    if (typeof content !== 'string') {
      throw new RunnerError(`Memory file ${file} line ${i + 1} has no string "content"`);
    }
    if (content.trim() !== '') items.push(content);
  });
  return items;
}
