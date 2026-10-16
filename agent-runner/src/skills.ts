import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RunnerError } from './errors.js';

/**
 * Loads `<agentDir>/skills/<slug>.md` bodies referenced by the manifest's
 * `skills` slugs, in order. These are RESOLVED skill bodies (not slugs) —
 * `reviewPullRequest` (reviewer-core) takes strings, exactly like the studio
 * resolves slugs to DB rows before calling the same engine (AC-36 parity).
 * Only this agent's folder is ever read (AC-85).
 */
export function loadSkillBodies(
  agentDir: string,
  slugs: readonly string[],
  readFile: typeof readFileSync = readFileSync,
): string[] {
  return slugs.map((slug) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug) || slug.includes('..')) {
      throw new RunnerError(`Invalid skill slug in manifest: ${JSON.stringify(slug)}`);
    }
    const skillPath = path.join(agentDir, 'skills', `${slug}.md`);
    try {
      return readFile(skillPath, 'utf8') as unknown as string;
    } catch (err) {
      throw new RunnerError(
        `Skill file for slug '${slug}' not found at ${skillPath}: ${(err as Error).message}`,
      );
    }
  });
}
