import { INJECTION_GUARD, wrapUntrusted } from '../../platform/prompt.js';
import { EXCERPT_MAX_BYTES, INPUT_TOKEN_CAP } from './constants.js';
import type { BuiltMessages, TokenCounter, TourFacts } from './types.js';

/**
 * Prompt assembly for the ONE structured call. Every repository-derived string
 * (paths, manifests, commands, excerpts) travels through `wrapUntrusted`. No
 * file content other than the supplied excerpts enters the prompt; the README
 * only contributes via detected commands (NFR-3a, EC-13).
 */

export interface Excerpt {
  path: string;
  text: string;
}

function capBytes(text: string, max: number): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= max) return text;
  return buf.subarray(0, max).toString('utf8').replace(/�+$/u, '');
}

interface Flags {
  excerptCount: number;
  structureLimit: number;
  routesLimit: number;
}

function renderUser(facts: TourFacts, excerpts: Excerpt[], f: Flags): string {
  const shown = excerpts.slice(0, f.excerptCount);
  const structure = facts.structure.slice(0, f.structureLimit);
  const routes = facts.routes.slice(0, f.routesLimit);
  const sections: string[] = [];

  sections.push(
    `## Basis\nbased on top ${shown.length} of ${facts.filesIndexed} indexed files` +
      `${facts.hotness.note ? `\n${facts.hotness.note}` : ''}`,
  );
  sections.push(
    `## Stack\n${wrapUntrusted('stack', facts.stack.map((s) => `${s.name} (${s.evidence})`).join('\n') || '(none detected)')}`,
  );
  sections.push(
    `## Directory structure (${structure.length} of ${facts.structure.length})\n${wrapUntrusted(
      'structure',
      structure.map((d) => `${d.path} ${d.files} files`).join('\n') || '(none)',
    )}`,
  );
  sections.push(
    `## Routes (${routes.length} of ${facts.routes.length})\n${wrapUntrusted('routes', routes.join('\n') || '(none)')}`,
  );
  sections.push(
    `## Detected commands (copy verbatim)\n${wrapUntrusted(
      'commands',
      facts.commands.map((c) => `[${c.kind}] ${c.command}  (source: ${c.source})`).join('\n') || '(none)',
    )}`,
  );
  sections.push(
    `## Critical path candidates\n${wrapUntrusted(
      'critical-paths',
      facts.criticalPaths.map((c) => `${c.path} (imported by ${c.importers})`).join('\n') || '(none)',
    )}`,
  );
  sections.push(
    `## Reading path candidates (in order)\n${wrapUntrusted(
      'reading-path',
      facts.readingPath.map((r) => `${r.position}. ${r.path}`).join('\n') || '(none)',
    )}`,
  );
  if (shown.length > 0) {
    sections.push(
      `## File excerpts\n${shown.map((e) => wrapUntrusted(`file:${e.path}`, capBytes(e.text, EXCERPT_MAX_BYTES))).join('\n\n')}`,
    );
  }
  return sections.join('\n\n');
}

/**
 * Budget loop: while system+user exceeds the cap, drop whole excerpts from the
 * lowest-scored file first (excerpts arrive in score order), then trim the
 * structure and route lists.
 */
export function buildOnboardingMessages(
  facts: TourFacts,
  excerpts: Excerpt[],
  counter: TokenCounter,
  systemTemplate: string,
): BuiltMessages {
  const system = `${systemTemplate}\n\n${INJECTION_GUARD}`;
  const f: Flags = {
    excerptCount: excerpts.length,
    structureLimit: facts.structure.length,
    routesLimit: facts.routes.length,
  };
  for (;;) {
    const user = renderUser(facts, excerpts, f);
    const tokens = counter.count(system + user);
    const exhausted = f.excerptCount === 0 && f.structureLimit === 0 && f.routesLimit === 0;
    if (tokens <= INPUT_TOKEN_CAP || exhausted) {
      return {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        tokens,
        filesConsidered: f.excerptCount,
      };
    }
    if (f.excerptCount > 0) f.excerptCount -= 1;
    else if (f.structureLimit > 0) f.structureLimit = Math.floor(f.structureLimit / 2);
    else f.routesLimit = Math.floor(f.routesLimit / 2);
  }
}
