/**
 * repo-intel pipeline — repository facts (pure parsers).
 *
 * Deterministic, inert text parsing for the onboarding tour's "repo facts":
 * package manager, run commands, tech stack, directory structure. NO fs, NO git,
 * NO DB — callers (the facade's `getRepoFacts`) do the reading and hand the raw
 * text in. Nothing here ever executes or evaluates what it parses (manifests and
 * READMEs are untrusted); a malformed input yields an empty result, never a throw.
 *
 * Every output is sorted deterministically so two runs over the same checkout
 * are byte-identical.
 */
import { FACTS_MAX_FENCE_LINES } from '../constants.js';
import type { DetectedCommand, DirStat, StackItem } from '../types.js';

export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'bun';
export type CommandKind = DetectedCommand['kind'];

/** Max characters of one extracted shell line (keeps prompts and UI bounded). */
const MAX_COMMAND_CHARS = 200;

const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['bun.lockb', 'bun'],
];

const SHELL_FENCE_LANGS: ReadonlySet<string> = new Set(['bash', 'sh', 'shell', 'console', 'zsh']);

function baseName(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

function dirName(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** Root lockfile wins over nested ones; ties resolve in LOCKFILES order. */
export function detectPackageManager(
  paths: string[],
): { pm: PackageManager; lockfile: string } | null {
  const sorted = [...paths].sort();
  for (const root of [true, false]) {
    for (const [file, pm] of LOCKFILES) {
      const hit = sorted.find((p) => (root ? p === file : baseName(p) === file && p !== file));
      if (hit) return { pm, lockfile: hit };
    }
  }
  return null;
}

/** `cd <dir> && <cmd>` for a nested manifest, the bare command at the root. */
function inDir(dir: string, cmd: string): string {
  return dir ? `cd ${dir} && ${cmd}` : cmd;
}

/**
 * Install command for the manifest's directory plus `<pm> run <script>` for each
 * script, each classified. Invalid JSON / no scripts object gives `[]`.
 */
export function commandsFromPackageJson(
  source: string,
  rawJson: string,
  pm: PackageManager | null,
): DetectedCommand[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return [];
  const manager: PackageManager = pm ?? 'npm';
  const dir = dirName(source);
  const out: DetectedCommand[] = [
    { command: inDir(dir, `${manager} install`), kind: 'install', source },
  ];
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts)) {
    for (const name of Object.keys(scripts).sort()) {
      if (name.length > 80 || /[\s'"`$;&|<>]/.test(name)) continue; // inert display only
      const command = inDir(dir, `${manager} run ${name}`);
      out.push({ command, kind: classifyCommand(command), source });
    }
  }
  return out;
}

/**
 * Lines inside ```bash|sh|shell|console|zsh fences only. Strips a leading `$ `,
 * skips comments and blank lines, caps line count and line length.
 */
export function extractShellFences(markdown: string, source: string): DetectedCommand[] {
  const out: DetectedCommand[] = [];
  let inFence = false;
  let shell = false;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      if (inFence) {
        inFence = false;
        shell = false;
      } else {
        inFence = true;
        const lang = line.slice(3).trim().split(/[\s{]/)[0]!.toLowerCase();
        shell = SHELL_FENCE_LANGS.has(lang);
      }
      continue;
    }
    if (!inFence || !shell) continue;
    let cmd = line;
    if (cmd.startsWith('$ ')) cmd = cmd.slice(2).trim();
    if (cmd === '' || cmd.startsWith('#')) continue;
    if (cmd.length > MAX_COMMAND_CHARS) continue;
    out.push({ command: cmd, kind: classifyCommand(cmd), source });
    if (out.length >= FACTS_MAX_FENCE_LINES) break;
  }
  return out;
}

/** `cp <env-example> <dir>/.env`, derived from the file's presence. */
export function envExampleCommand(path: string): DetectedCommand {
  const dir = dirName(path);
  const target = dir ? `${dir}/.env` : '.env';
  return { command: `cp ${path} ${target}`, kind: 'configure', source: path };
}

/** `docker compose -f <file> up -d`, derived from the file's presence. */
export function composeCommand(path: string): DetectedCommand {
  return { command: `docker compose -f ${path} up -d`, kind: 'services', source: path };
}

const INSTALL_RE =
  /^(?:(?:npm|pnpm|yarn|bun)\s+(?:install|i|ci)(?:\s|$)|(?:npm|pnpm|yarn|bun)\s+add\s*$|yarn\s*$|pip3?\s+install\s+-r\b|bundle\s+install\b|go\s+mod\s+download\b|poetry\s+install\b|cargo\s+fetch\b)/;
const CONFIGURE_RE = /(?:^cp\s+\S*\.?env\S*|migrate|setup|seed)/;
const SERVICES_RE = /^(?:docker\s+compose\b.*\bup\b|docker-compose\b.*\bup\b)/;
const RUN_RE =
  /^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve)(?::\S+)?(?:\s|$)|(?:npm|pnpm|yarn|bun)\s+run\s+(?:dev|start|serve)\S*)/;

/** Classify a command. Rules in order: install, services, configure, run, other. */
export function classifyCommand(cmd: string): CommandKind {
  // Judge the command after any `cd <dir> &&` prefix.
  const c = cmd.replace(/^\s*cd\s+\S+\s*&&\s*/, '').trim();
  if (INSTALL_RE.test(c)) return 'install';
  if (SERVICES_RE.test(c)) return 'services';
  if (CONFIGURE_RE.test(c)) return 'configure';
  if (RUN_RE.test(c)) return 'run';
  return 'other';
}

// ---- Stack ------------------------------------------------------------------

const DEPENDENCY_STACK: ReadonlyArray<readonly [string, string]> = [
  ['next', 'Next.js'],
  ['react', 'React'],
  ['vue', 'Vue'],
  ['svelte', 'Svelte'],
  ['fastify', 'Fastify'],
  ['express', 'Express'],
  ['@nestjs/core', 'NestJS'],
  ['drizzle-orm', 'Drizzle ORM'],
  ['prisma', 'Prisma'],
  ['@prisma/client', 'Prisma'],
  ['typeorm', 'TypeORM'],
  ['typescript', 'TypeScript'],
  ['vitest', 'Vitest'],
  ['jest', 'Jest'],
  ['tailwindcss', 'Tailwind CSS'],
  ['zod', 'Zod'],
];

const MANIFEST_STACK: ReadonlyArray<readonly [string, string]> = [
  ['package.json', 'Node.js'],
  ['pyproject.toml', 'Python'],
  ['requirements.txt', 'Python'],
  ['go.mod', 'Go'],
  ['Cargo.toml', 'Rust'],
  ['Gemfile', 'Ruby'],
  ['pom.xml', 'Java'],
  ['build.gradle', 'Java'],
  ['Dockerfile', 'Docker'],
];

/**
 * Fixed-table stack detection from file presence and `package.json` dependency
 * names. The first evidence (by path asc) per name wins. Sorted by name.
 */
export function detectStack(
  paths: string[],
  manifests: Array<{ path: string; raw: string }>,
): StackItem[] {
  const found = new Map<string, string>();
  const add = (name: string, evidence: string): void => {
    if (!found.has(name)) found.set(name, evidence);
  };

  for (const p of [...paths].sort()) {
    const base = baseName(p);
    for (const [file, name] of MANIFEST_STACK) {
      if (base === file) add(name, p);
    }
  }

  for (const m of [...manifests].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (baseName(m.path) !== 'package.json') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(m.raw);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const bag = parsed as Record<string, unknown>;
    const deps = new Set<string>();
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const d = bag[key];
      if (typeof d === 'object' && d !== null && !Array.isArray(d)) {
        for (const k of Object.keys(d)) deps.add(k);
      }
    }
    for (const [dep, name] of DEPENDENCY_STACK) {
      if (deps.has(dep)) add(name, `${m.path}: dependency ${dep}`);
    }
  }

  return [...found.entries()]
    .map(([name, evidence]) => ({ name, evidence }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * File counts per directory down to `depth` levels (a file counts toward every
 * ancestor directory within depth). Root-level files are not listed. Sorted by path.
 */
export function summarizeStructure(paths: string[], depth = 2): DirStat[] {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const segs = p.split('/');
    segs.pop(); // drop the file name
    const max = Math.min(segs.length, depth);
    for (let i = 1; i <= max; i += 1) {
      const dir = segs.slice(0, i).join('/');
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([path, files]) => ({ path, files }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
