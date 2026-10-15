import { ciInstallBranch, ciRemovalBranch } from '@devdigest/shared';
import type { CiInstallationStatus, CiPostAs } from '@devdigest/shared';
import { MIN_SECRET_LENGTH } from './constants.js';

/** Pure helpers for the ci module (ring 1): no I/O, no framework imports. */

const MAX_SLUG_LENGTH = 60;

/** kebab-case slug: lowercase, non-alphanumerics collapsed to `-`, capped. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH - 4) // leave room for a `-NN` collision suffix
    .replace(/-+$/g, '');
}

/** The lowest free of `base`, `base-2`, `base-3`, ... (AC-84). */
export function allocateSlug(base: string, taken: ReadonlySet<string>): string {
  const root = base || 'agent';
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** `YYYYMMDD-HHMMSS` in UTC. */
export function timestampSuffix(now: Date): string {
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  );
}

const TS_RE = /^\d{8}-\d{6}$/;

function matchesBranch(defaultName: string, name: string): boolean {
  if (name === defaultName) return true;
  if (!name.startsWith(`${defaultName}-`)) return false;
  return TS_RE.test(name.slice(defaultName.length + 1));
}

/** Only the exact default install branch or default + `-YYYYMMDD-HHMMSS` (AC-26). */
export function isAllowedInstallBranch(slug: string, name: string): boolean {
  return matchesBranch(ciInstallBranch(slug), name);
}

/** Only the exact default removal branch or default + `-YYYYMMDD-HHMMSS` (AC-92). */
export function isAllowedRemovalBranch(slug: string, name: string): boolean {
  return matchesBranch(ciRemovalBranch(slug), name);
}

/** `https://github.com/<owner>/<repo>/actions/runs/<id>` — the only link we render. */
export function buildRunUrl(fullName: string, runId: number): string {
  return `https://github.com/${fullName}/actions/runs/${runId}`;
}

/** True when any non-trivial secret value appears in any file's text (NFR-2). */
export function containsSecret(
  files: ReadonlyArray<{ contents: string | null }>,
  values: readonly string[],
): boolean {
  const needles = values.filter((v) => v.length >= MIN_SECRET_LENGTH);
  if (needles.length === 0) return false;
  return files.some((f) => f.contents != null && needles.some((v) => f.contents!.includes(v)));
}

/** Status of the Actions secret the workflow needs, from the names list only. */
export function secretStatusFromNames(
  names: readonly string[] | null,
  wanted: string,
): 'set' | 'not_set' | 'required' {
  if (names == null) return 'required';
  return names.includes(wanted) ? 'set' : 'not_set';
}

/**
 * AC-59 / A16: an installation counts as an active repo when it is not
 * removed AND (its install PR merged OR at least one accepted run exists).
 */
export function isActiveRepo(
  installation: { status: CiInstallationStatus; prState: 'open' | 'merged' | 'closed' | null },
  acceptedRuns: number,
): boolean {
  if (installation.status === 'removed') return false;
  return installation.prState === 'merged' || acceptedRuns >= 1;
}

/**
 * File slugs for an agent's skills (A13): `slugify(name)`, with `-2` / `-3`
 * suffixes for collisions within the agent. Same order as the input.
 */
export function skillFileSlugs(skills: ReadonlyArray<{ name: string }>): string[] {
  const taken = new Set<string>();
  return skills.map((s) => {
    const slug = allocateSlug(slugify(s.name) || 'skill', taken);
    taken.add(slug);
    return slug;
  });
}

/** Workflow job `permissions.pull-requests` for a post method. */
export function pullRequestsPermission(postAs: CiPostAs): 'write' | 'read' {
  return postAs === 'none' ? 'read' : 'write';
}
