import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/**
 * Loads and VALIDATES the checked-in `.devdigest/agents/<slug>/manifest.yaml`
 * (AC-20). The manifest is written by the studio's export flow and is otherwise
 * untrusted on-disk content by the time it reaches CI — it is schema-validated
 * with the same `AgentManifest` Zod contract before any of its fields (system
 * prompt, model, ci_fail_on) are used to build a review. Fail clearly (a
 * descriptive `RunnerError`) rather than silently defaulting or partially
 * trusting it. Exactly one file is read; the agents folder is never scanned
 * (AC-85).
 */

export type { AgentManifest } from '@devdigest/shared';

export interface FsDeps {
  readFile?: typeof readFileSync;
}

/** Read, parse, and Zod-validate the manifest at `manifestPath` (AC-20). */
export function loadAgentManifest(manifestPath: string, deps: FsDeps = {}): AgentManifest {
  const readFile = deps.readFile ?? readFileSync;
  let raw: string;
  try {
    raw = readFile(manifestPath, 'utf8') as unknown as string;
  } catch (err) {
    throw new RunnerError(
      `Cannot read agent manifest at ${manifestPath}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new RunnerError(
      `Agent manifest at ${manifestPath} is not valid YAML: ${(err as Error).message}`,
    );
  }

  const result = AgentManifest.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new RunnerError(`Agent manifest at ${manifestPath} failed validation: ${issues}`);
  }
  return result.data;
}

/** Load + validate exactly `<agentDir>/manifest.yaml`. */
export function loadManifest(agentDir: string, deps: FsDeps = {}): AgentManifest {
  return loadAgentManifest(path.join(agentDir, 'manifest.yaml'), deps);
}
