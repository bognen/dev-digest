import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  AgentManifest,
  ciAgentDir,
  ciManifestPath,
  ciMemoryPath,
  ciSkillPath,
  ciWorkflowPath,
} from '@devdigest/shared';
import type { CiPreviewFile } from '@devdigest/shared';
import { skillFileSlugs } from '../helpers.js';
import type { CiAgentLike, CiMemoryRow, CiRunnerBundle, CiSkillLike } from '../types.js';

/** Directory (inside the agent folder) that holds the runner bundle files. */
export const ciRunnerDir = (slug: string): string => `${ciAgentDir(slug)}runner/`;

/** Pure builders for the files an export writes (manifest, skills, memory, file set). */

/** Skills that are exported: enabled and not flagged by the injection scan, in link order. */
export function buildSkillFiles(
  skills: ReadonlyArray<CiSkillLike>,
): { slug: string; skill: CiSkillLike }[] {
  const kept = skills.filter((s) => s.enabled && !s.injectionDetected);
  const slugs = skillFileSlugs(kept);
  return kept.map((skill, i) => ({ slug: slugs[i]!, skill }));
}

/** `manifest.yaml` text. Always carries `studio_agent_id`; self-checked against the contract. */
export function buildManifestYaml(agent: CiAgentLike, skillSlugs: readonly string[]): string {
  const manifest = {
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: [...skillSlugs],
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
    studio_agent_id: agent.id,
  };
  const text = stringifyYaml(manifest);
  AgentManifest.parse(parseYaml(text));
  return text;
}

/**
 * True only when the manifest text carries `studio_agent_id === agentId`.
 * Invalid YAML, a failing contract, or a missing id → false (folder is foreign).
 */
export function isSameAgentManifest(yamlText: string, agentId: string): boolean {
  try {
    const parsed = AgentManifest.safeParse(parseYaml(yamlText));
    return parsed.success && parsed.data.studio_agent_id === agentId;
  } catch {
    return false;
  }
}

/** One JSON line per memory row: `{"kind","scope","content"}` (A5). */
export function buildMemoryJsonl(rows: ReadonlyArray<CiMemoryRow>): string {
  return rows
    .map((r) => JSON.stringify({ kind: r.kind, scope: r.scope, content: r.content }))
    .join('\n')
    .concat(rows.length > 0 ? '\n' : '');
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

function file(path: string, contents: string, editable: boolean): CiPreviewFile {
  return {
    path,
    editable,
    contents,
    size_bytes: Buffer.byteLength(contents, 'utf8'),
    sha256: sha256(contents),
  };
}

export interface BuildFileSetInput {
  slug: string;
  agent: CiAgentLike;
  skills: ReadonlyArray<CiSkillLike>;
  /** `null` = memory export off. */
  memory: ReadonlyArray<CiMemoryRow> | null;
  workflowYaml: string;
  /** Every runner bundle file (filename -> text), emitted as `<agentDir>runner/<filename>`. */
  runnerBundle: CiRunnerBundle;
  /** Preview hides the runner bytes (A11); PR / zip carry the real contents. */
  hideRunnerContents: boolean;
}

/** Every file of an export: the agent folder plus the workflow. */
export function buildFileSet(input: BuildFileSetInput): CiPreviewFile[] {
  const { slug } = input;
  const skillFiles = buildSkillFiles(input.skills);
  const files: CiPreviewFile[] = [
    file(ciWorkflowPath(slug), input.workflowYaml, true),
    file(
      ciManifestPath(slug),
      buildManifestYaml(
        input.agent,
        skillFiles.map((s) => s.slug),
      ),
      false,
    ),
    ...skillFiles.map((s) => file(ciSkillPath(slug, s.slug), s.skill.body, false)),
  ];
  if (input.memory) files.push(file(ciMemoryPath(slug), buildMemoryJsonl(input.memory), false));
  for (const name of Object.keys(input.runnerBundle).sort()) {
    // Bundle names are a flat file list; refuse anything that could leave runner/.
    if (name.includes('/') || name.includes('\\') || name.includes('..') || name === '') {
      throw new Error(`invalid runner bundle file name: ${name}`);
    }
    const runner = file(`${ciRunnerDir(slug)}${name}`, input.runnerBundle[name]!, false);
    files.push(input.hideRunnerContents ? { ...runner, contents: null } : runner);
  }
  return files;
}

/**
 * `deletePaths` for a re-export (AC-82, A6): existing files under the agent's own folder
 * that are not part of the new set. Never returns a path outside `ciAgentDir(slug)`.
 */
export function syncDeletes(
  slug: string,
  existingPaths: readonly string[],
  newPaths: readonly string[],
): string[] {
  const dir = ciAgentDir(slug);
  const keep = new Set(newPaths);
  return existingPaths.filter((p) => p.startsWith(dir) && !p.includes('..') && !keep.has(p));
}
