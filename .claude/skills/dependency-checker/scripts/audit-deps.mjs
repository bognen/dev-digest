#!/usr/bin/env node
// Dependency audit for the dependency-checker skill.
//
//   node audit-deps.mjs [--root <repo>] [--out <dir>] [--packages a,b,c]
//                       [--audit] [--outdated] [--top 8] [--no-write]
//
// Discovers every package (a directory with a package.json, one level below the
// repo root), then for each declared dependency collects: kind (runtime / dev /
// peer / optional), category, declared range vs resolved version, installed size
// (own + transitive closure), license, install-script flag, and where it is
// actually imported (src / test / config). Adds cross-package drift, internal
// package edges (tsconfig paths), and a rule-based, prioritised findings list.
// Writes deps.json + deps-report.md (with a Mermaid diagram). Findings are
// CANDIDATES: the skill tells the agent to verify each before reporting.
// Zero dependencies, Node >= 18. --audit / --outdated need network (best effort).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const ROOT = path.resolve(opt('root', process.cwd()));
const OUT = path.resolve(ROOT, opt('out', 'docs/dependency-checker'));
const TOP = Number(opt('top', 8));
const ONLY = opt('packages', '')?.split(',').filter(Boolean);
const DO_AUDIT = flag('audit');
const DO_OUTDATED = flag('outdated');

// ---------- helpers ----------
const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
};
const exists = (p) => fs.existsSync(p);
const posix = (p) => p.split(path.sep).join('/');
const fmtBytes = (b) => {
  if (b == null) return 'n/a';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.next-e2e', 'coverage', 'clones',
  'test-results', 'playwright-report', '.git', '.devdigest', '__pycache__', '.turbo']);

// ---------- package discovery ----------
function discoverPackages() {
  const found = [];
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const dir = path.join(ROOT, e.name);
    const pj = readJson(path.join(dir, 'package.json'));
    if (pj && (!ONLY.length || ONLY.includes(e.name))) found.push({ folder: e.name, dir, pj });
  }
  if (exists(path.join(ROOT, 'package.json')) && !ONLY.length) {
    found.unshift({ folder: '.', dir: ROOT, pj: readJson(path.join(ROOT, 'package.json')) });
  }
  return found;
}

function detectManager(dir) {
  if (exists(path.join(dir, 'pnpm-lock.yaml'))) return { name: 'pnpm', lock: 'pnpm-lock.yaml' };
  if (exists(path.join(dir, 'package-lock.json'))) return { name: 'npm', lock: 'package-lock.json' };
  if (exists(path.join(dir, 'yarn.lock'))) return { name: 'yarn', lock: 'yarn.lock' };
  if (exists(path.join(dir, 'bun.lockb')) || exists(path.join(dir, 'bun.lock'))) return { name: 'bun', lock: 'bun.lock' };
  return { name: 'unknown', lock: null };
}

// ---------- installed package resolution + sizes ----------
const pjCache = new Map(); // realDir -> package.json | null
const sizeCache = new Map(); // realDir -> {bytes, files}
const readPj = (real) => {
  if (!pjCache.has(real)) pjCache.set(real, readJson(path.join(real, 'package.json')));
  return pjCache.get(real);
};

// Node resolution from `fromDir`, returning the real (symlink-resolved) dir.
function resolveInstalled(name, fromDir) {
  let d = fromDir;
  for (;;) {
    const cand = path.basename(d) === 'node_modules' ? path.join(d, name) : path.join(d, 'node_modules', name);
    if (exists(path.join(cand, 'package.json'))) {
      try { return fs.realpathSync(cand); } catch { return cand; }
    }
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

function ownSize(real) {
  if (sizeCache.has(real)) return sizeCache.get(real);
  let bytes = 0, files = 0;
  const walk = (dir) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === 'node_modules') continue; // nested deps are counted via the closure
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { try { bytes += fs.statSync(p).size; files++; } catch { /* ignore */ } }
    }
  };
  walk(real);
  const r = { bytes, files };
  sizeCache.set(real, r);
  return r;
}

// Transitive closure (dependencies + optionalDependencies) of real dirs, excluding start.
function closure(startReal) {
  const seen = new Set([startReal]);
  const queue = [startReal];
  while (queue.length) {
    const cur = queue.pop();
    const pj = readPj(cur);
    if (!pj) continue;
    const kids = { ...(pj.dependencies || {}), ...(pj.optionalDependencies || {}) };
    for (const k of Object.keys(kids)) {
      const r = resolveInstalled(k, cur);
      if (r && !seen.has(r)) { seen.add(r); queue.push(r); }
    }
  }
  seen.delete(startReal);
  return seen;
}

// ---------- source usage scan ----------
const CODE_RE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const TEST_RE = /(?:\.|\/)(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:__tests__|__mocks__|_tests?|tests?|test-utils|testing|e2e|evals|fixtures)\/|(?:^|\/)(?:vitest|jest)\.setup\.[cm]?[jt]s$/;
const CONFIG_RE = /(?:^|\/)[^/]*\.config\.[cm]?[jt]s$|^(?:scripts|tools|\.config)\//;
const TYPE_IMPORT_RE = /\b(?:import|export)\s+type\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g;
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire(?:\.resolve)?\s*\(\s*)(?:\/\*[\s\S]*?\*\/\s*)*['"]([^'"]+)['"]/g;

const pkgNameOf = (spec) => {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return null;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

function scanUsage(dir, declared) {
  const usage = new Map(); // dep -> {src,test,config,typeOnly,strRef,files:{kind:[sample paths]}}
  const cross = []; // production-source relative imports that leave this package
  const bump = (dep, kind, file) => {
    if (!usage.has(dep)) usage.set(dep, { src: 0, test: 0, config: 0, typeOnly: 0, strRef: 0, files: {} });
    const u = usage.get(dep);
    u[kind]++;
    const list = (u.files[kind] ||= []);
    if (list.length < 3 && !list.includes(file)) list.push(file);
  };
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!CODE_RE.test(e.name) || /\.d\.ts$/.test(e.name)) continue;
      let text;
      try { if (fs.statSync(p).size > 1_000_000) continue; text = fs.readFileSync(p, 'utf8'); } catch { continue; }
      const rel = posix(path.relative(dir, p));
      const kind = TEST_RE.test(rel) ? 'test' : CONFIG_RE.test(rel) ? 'config' : 'src';
      text = text.replace(TYPE_IMPORT_RE, (_m, spec) => {
        const n = pkgNameOf(spec);
        if (n) bump(n, 'typeOnly', rel);
        return '';
      });
      for (const m of text.matchAll(IMPORT_RE)) {
        const n = pkgNameOf(m[1]);
        if (n) bump(n, kind, rel);
        else if (m[1].startsWith('.')) { // relative import that escapes this package = reaching into another package's files
          const abs = path.resolve(path.dirname(p), m[1]);
          const other = packages.find((q) => q.dir !== dir && abs.startsWith(q.dir + path.sep)); // must land inside another package
          if (other && kind === 'src') cross.push({ file: rel, spec: m[1], target: posix(path.relative(ROOT, abs)) });
        }
      }
      // string-literal references, e.g. pino `target: 'pino-pretty'` or plugin names
      for (const name of declared) if (text.includes(`'${name}'`) || text.includes(`"${name}"`)) bump(name, 'strRef', rel);
    }
  };
  walk(dir);
  return { usage, cross };
}

// Text that may reference CLI tools / config-only deps (package scripts + root config files).
function configCorpus(dir, pj) {
  let text = JSON.stringify(pj.scripts || {}) + JSON.stringify(pj.pnpm || {}) + JSON.stringify(pj.overrides || {});
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile() || e.name === 'package.json' || /lock/.test(e.name)) continue;
    if (/\.(json|ya?ml|[cm]?[jt]s)$|^\.[a-z]*rc/.test(e.name)) {
      try { text += '\n' + fs.readFileSync(path.join(dir, e.name), 'utf8'); } catch { /* ignore */ }
    }
  }
  const wf = path.join(ROOT, '.github', 'workflows');
  if (exists(wf)) for (const f of fs.readdirSync(wf)) { try { text += fs.readFileSync(path.join(wf, f), 'utf8'); } catch { /* ignore */ } }
  return text;
}

// ---------- classification ----------
const CATEGORY_RULES = [
  ['types', /^@types\//],
  ['test', /^(vitest|jest|@vitest\/|@testing-library\/|playwright|@playwright\/|testcontainers|@testcontainers\/|agent-browser|jsdom|happy-dom|msw|supertest)/],
  ['lint/format', /^(eslint|prettier|@eslint\/|eslint-|typescript-eslint|dependency-cruiser|biome|@biomejs\/)/],
  ['build/tooling', /^(typescript|tsx|ts-node|tsup|esbuild|vite|@vitejs\/|webpack|rollup|postcss|autoprefixer|tailwindcss|@tailwindcss\/|@swc\/|drizzle-kit|turbo|@ast-grep\/)/],
  ['framework', /^(next|react|react-dom|fastify|@fastify\/|express|hono|koa)$|^@fastify\//],
  ['database', /^(drizzle-orm|pg|postgres|@electric-sql\/|pgvector|kysely|prisma|@prisma\/)/],
  ['validation', /^(zod|ajv|yup|valibot|joi|zod-to-json-schema)/],
  ['ai/llm', /^(openai|@anthropic-ai\/|@modelcontextprotocol\/|ai|@ai-sdk\/|langchain|@langchain\/|tiktoken)/],
  ['ui', /^(@radix-ui\/|lucide-react|clsx|class-variance-authority|tailwind-merge|framer-motion|recharts|@tanstack\/|sonner|cmdk|mermaid)/],
  ['git/vcs', /^(simple-git|octokit|@octokit\/|isomorphic-git)/],
];
const categoryOf = (n) => CATEGORY_RULES.find(([, re]) => re.test(n))?.[0] ?? 'other';

const COPYLEFT_RE = /\b(A?GPL|LGPL|SSPL|EUPL|CPAL|OSL)\b/i;
const licenseOf = (pj) => {
  const l = pj?.license ?? (pj?.licenses?.[0]?.type);
  return typeof l === 'string' ? l : l?.type ?? 'unknown';
};
const rangeKind = (r) => {
  if (/^(workspace:|file:|link:|portal:)/.test(r)) return 'local';
  if (/^(git|github:|https?:|[\w-]+\/[\w.-]+(#.*)?$)/.test(r)) return 'git/url';
  if (r === '*' || r === 'latest' || r === '' || /^>=?\s*\d/.test(r) || r === 'x') return 'loose';
  if (/^\^/.test(r)) return 'caret';
  if (/^~/.test(r)) return 'tilde';
  return 'exact';
};

// ---------- optional network checks ----------
function runCli(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, shell: true, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
  return { out: r.stdout || '', err: r.stderr || '', status: r.status };
}
function auditPackage(mgr, dir) {
  if (!['pnpm', 'npm'].includes(mgr)) return { available: false, reason: `unsupported manager: ${mgr}`, byDep: {} };
  const r = runCli(mgr, ['audit', '--json'], dir); // non-zero exit just means vulns were found
  let j; try { j = JSON.parse(r.out); } catch { return { available: false, reason: (r.err || r.out).slice(0, 200).trim() || 'no JSON output', byDep: {} }; }
  const byDep = {};
  const add = (name, sev, title, url) => { (byDep[name] ||= []).push({ severity: sev, title, url }); };
  if (j.advisories) for (const a of Object.values(j.advisories)) add(a.module_name, a.severity, a.title, a.url);
  else if (j.vulnerabilities) for (const [name, v] of Object.entries(j.vulnerabilities)) {
    const via = (v.via || []).find((x) => typeof x === 'object');
    add(name, v.severity, via?.title ?? 'vulnerable (see npm audit)', via?.url ?? '');
  }
  else return { available: false, reason: j.error?.message || 'unrecognised audit output', byDep: {} };
  return { available: true, byDep };
}
function outdatedPackage(mgr, dir) {
  if (!['pnpm', 'npm'].includes(mgr)) return { available: false, reason: `unsupported manager: ${mgr}`, byDep: {} };
  const r = runCli(mgr, mgr === 'pnpm' ? ['outdated', '--format', 'json'] : ['outdated', '--json'], dir);
  let j; try { j = JSON.parse(r.out || '{}'); } catch { return { available: false, reason: (r.err || r.out).slice(0, 200).trim(), byDep: {} }; }
  const byDep = {};
  for (const [name, v] of Object.entries(j)) byDep[name] = { current: v.current, wanted: v.wanted, latest: v.latest, deprecated: !!v.isDeprecated };
  return { available: true, byDep };
}
const major = (v) => Number(String(v ?? '').replace(/^[^\d]*/, '').split('.')[0]);

// ---------- collect ----------
const packages = discoverPackages();
if (!packages.length) { console.error('No packages found under ' + ROOT); process.exit(2); }

const data = { generatedAt: new Date().toISOString(), root: ROOT, options: { audit: DO_AUDIT, outdated: DO_OUTDATED }, packages: [], internalEdges: [], drift: [], findings: [], notes: [] };

for (const p of packages) {
  const mgr = detectManager(p.dir);
  const installed = exists(path.join(p.dir, 'node_modules'));
  const { usage, cross } = scanUsage(p.dir, ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((s) => Object.keys(p.pj[s] || {})));
  const corpus = configCorpus(p.dir, p.pj);
  const rootFiles = fs.readdirSync(p.dir).filter((f) => !SKIP_DIRS.has(f));
  const audit = DO_AUDIT ? auditPackage(mgr.name, p.dir) : null;
  const outdated = DO_OUTDATED ? outdatedPackage(mgr.name, p.dir) : null;
  const union = new Set();
  const deps = [];
  const sections = [['dependencies', 'runtime'], ['devDependencies', 'dev'], ['peerDependencies', 'peer'], ['optionalDependencies', 'optional']];
  for (const [section, kind] of sections) {
    for (const [name, range] of Object.entries(p.pj[section] || {})) {
      const real = installed ? resolveInstalled(name, p.dir) : null;
      const ipj = real ? readPj(real) : null;
      const own = real ? ownSize(real) : null;
      let trans = null;
      if (real) {
        const c = closure(real);
        let tb = 0; for (const r of c) { tb += ownSize(r).bytes; union.add(r); }
        union.add(real);
        trans = { count: c.size, bytes: tb };
      }
      const u = usage.get(name) || { src: 0, test: 0, config: 0, typeOnly: 0, strRef: 0, files: {} };
      const bins = ipj?.bin ? (typeof ipj.bin === 'string' ? [ipj.name?.split('/').pop()] : Object.keys(ipj.bin)) : [];
      const bare = name.replace(/^@types\//, '');
      const bareName = name.replace(/^@[^/]+\//, '');
      // a root file named after the dep (postcss.config.mjs, .eslintrc) counts as tooling use
      const referencedByTooling = rootFiles.some((f) => f.startsWith(bareName + '.') || f.startsWith('.' + bareName + 'rc')) || bins.some((b) => b && new RegExp(`(^|[^\\w-])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`).test(corpus))
        || corpus.includes(`"${name}"`) || corpus.includes(`'${name}'`) || corpus.includes(`${name}/`)
        || (name.startsWith('@types/') && corpus.includes(bare));
      const od = outdated?.byDep?.[name];
      deps.push({
        name, kind, section, range, rangeKind: rangeKind(range), category: categoryOf(name),
        resolved: ipj?.version ?? null, license: ipj ? licenseOf(ipj) : null,
        installScript: !!(ipj?.scripts && (ipj.scripts.install || ipj.scripts.postinstall || ipj.scripts.preinstall)) || !!ipj?.gypfile,
        ownBytes: own?.bytes ?? null, files: own?.files ?? null,
        transitiveCount: trans?.count ?? null, totalBytes: own && trans ? own.bytes + trans.bytes : null,
        usage: { src: u.src, test: u.test, config: u.config, typeOnly: u.typeOnly, strRef: u.strRef, sample: u.files },
        referencedByTooling,
        vulnerabilities: audit?.byDep?.[name] ?? [],
        outdated: od ? { current: od.current, latest: od.latest, majorsBehind: Math.max(0, major(od.latest) - major(od.current)), deprecated: od.deprecated } : null,
      });
    }
  }
  const totalBytes = installed ? [...union].reduce((s, r) => s + ownSize(r).bytes, 0) : null;
  data.packages.push({
    folder: p.folder, name: p.pj.name ?? p.folder, manager: mgr.name, lockfile: mgr.lock, installed, crossPackageImports: cross,
    counts: Object.fromEntries(sections.map(([s, k]) => [k, Object.keys(p.pj[s] || {}).length])),
    uniquePackagesInstalled: installed ? union.size : null, totalInstalledBytes: totalBytes,
    auditStatus: audit ? (audit.available ? 'ok' : `unavailable: ${audit.reason}`) : 'not run',
    outdatedStatus: outdated ? (outdated.available ? 'ok' : `unavailable: ${outdated.reason}`) : 'not run',
    deps,
  });
  if (!installed) data.notes.push(`${p.folder}: node_modules missing — sizes, licenses and resolved versions unavailable (run install first).`);
}

// ---------- internal edges (tsconfig paths pointing outside the package) ----------
const stripJsonc = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1');
for (const p of packages) {
  const ts = path.join(p.dir, 'tsconfig.json');
  if (!exists(ts)) continue;
  let cfg; try { cfg = JSON.parse(stripJsonc(fs.readFileSync(ts, 'utf8'))); } catch { continue; }
  const base = path.resolve(p.dir, cfg.compilerOptions?.baseUrl ?? '.');
  for (const [alias, targets] of Object.entries(cfg.compilerOptions?.paths ?? {})) {
    for (const t of targets) {
      const abs = path.resolve(base, t);
      const target = packages.find((q) => q.dir !== p.dir && abs.startsWith(q.dir + path.sep));
      if (target) data.internalEdges.push({ from: p.folder, to: target.folder, alias, target: posix(path.relative(ROOT, abs)) });
    }
  }
}
const edgeKey = new Set();
data.internalEdges = data.internalEdges.filter((e) => { const k = `${e.from}>${e.to}>${e.alias}`; return edgeKey.has(k) ? false : (edgeKey.add(k), true); });

// ---------- cross-package drift ----------
const byName = new Map();
for (const pk of data.packages) for (const d of pk.deps) {
  if (!byName.has(d.name)) byName.set(d.name, []);
  byName.get(d.name).push({ pkg: pk.folder, range: d.range, resolved: d.resolved, kind: d.kind });
}
for (const [name, list] of byName) {
  if (list.length < 2) continue;
  const ranges = new Set(list.map((l) => l.range)), resolved = new Set(list.map((l) => l.resolved).filter(Boolean));
  data.drift.push({ name, packages: list, rangeDrift: ranges.size > 1, resolvedDrift: resolved.size > 1 });
}
data.drift.sort((a, b) => Number(b.resolvedDrift) - Number(a.resolvedDrift) || a.name.localeCompare(b.name));

// ---------- findings (rule-based, prioritised) ----------
const SEV = { P0: 0, P1: 1, P2: 2, Info: 3 };
const F = (sev, rule, pkg, dep, detail, action, weight = 0) => data.findings.push({ sev, rule, package: pkg, dep, detail, action, weight });
const HEAVY_OWN = 20 * 1024 ** 2, HEAVY_TOTAL = 50 * 1024 ** 2;

for (const pk of data.packages) {
  for (const x of pk.crossPackageImports) F('P1', 'cross-package-relative-import', pk.folder, null, `${x.file} imports "${x.spec}" → ${x.target}, bypassing the other package's public entry point (packages are standalone; share code via tsconfig path aliases).`, 'Import through the package alias / public entry (index.ts) instead of a relative path into its internals.');
  if (!pk.lockfile) F('P1', 'no-lockfile', pk.folder, null, 'No lockfile found — installs are not reproducible.', 'Commit a lockfile for this package.');
  for (const d of pk.deps) {
    const u = d.usage, usedRuntime = u.src > 0, usedAnywhere = u.src + u.test + u.config + u.typeOnly + u.strRef > 0;
    if (d.vulnerabilities.length) { // one finding per dependency, at its worst severity
      const rank = { critical: 3, high: 2, moderate: 1, low: 0 };
      const vs = [...d.vulnerabilities].sort((a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0));
      const worst = rank[vs[0].severity] ?? 0, shipped = d.kind !== 'dev'; // dev-only tools are not in the production artifact
      const sev = worst >= 2 ? (shipped ? 'P0' : 'P2') : worst === 1 ? (shipped ? 'P1' : 'Info') : 'Info';
      const list = vs.slice(0, 3).map((v) => `${v.severity}: ${v.title}${v.url ? ` (${v.url})` : ''}`).join('; ');
      F(sev, 'vulnerability', pk.folder, d.name, `${vs.length} advisories (worst ${vs[0].severity}${shipped ? '' : ', dev-only'}). ${list}${vs.length > 3 ? `; +${vs.length - 3} more` : ''}`, 'Upgrade to a patched version (see advisories); if none exists, replace or isolate the dependency.', d.totalBytes ?? 0);
    }
    const copyleftOnly = d.license && COPYLEFT_RE.test(d.license) && !(/\bOR\b/.test(d.license) && d.license.split(/\s+OR\s+/).some((x) => !COPYLEFT_RE.test(x))); // dual "MIT OR GPL" can be taken as MIT
    if (d.kind === 'runtime' && copyleftOnly) F('P1', 'copyleft-license', pk.folder, d.name, `Runtime dependency licensed ${d.license}.`, 'Confirm licence compatibility with legal/owners or replace it.');
    if (d.kind === 'dev' && u.src > 0) F('P1', 'dev-dep-in-src', pk.folder, d.name, `devDependency imported by production source (${(u.sample.src || []).join(', ')}).`, 'Move to dependencies, or stop importing it from production code.');
    if (d.kind === 'runtime' && !usedAnywhere && !d.referencedByTooling && !d.name.startsWith('@types/')) F('P1', 'unused-runtime', pk.folder, d.name, 'Runtime dependency with no import, script or config reference found.', 'Verify (dynamic/string-based loading?) then remove.', d.totalBytes ?? 0);
    else if (d.kind === 'runtime' && !usedRuntime && (u.test + u.config) > 0 && !u.typeOnly && !d.name.startsWith('@types/')) F('P2', 'runtime-only-in-tests', pk.folder, d.name, `Declared in dependencies but only imported from test/config files (${[...(u.sample.test || []), ...(u.sample.config || [])].slice(0, 3).join(', ')}).`, 'Move to devDependencies.');
    if (d.kind === 'runtime' && d.name.startsWith('@types/')) F('Info', 'types-in-runtime', pk.folder, d.name, '@types package in dependencies.', 'Move to devDependencies unless public typings are shipped.');
    if (d.kind === 'dev' && !usedAnywhere && !d.referencedByTooling && !d.name.startsWith('@types/')) F('P2', 'unused-dev', pk.folder, d.name, 'devDependency with no import, script or config reference found.', 'Verify then remove.', d.totalBytes ?? 0);
    if (d.kind === 'runtime' && ((d.ownBytes ?? 0) >= HEAVY_OWN || (d.totalBytes ?? 0) >= HEAVY_TOTAL)) F('Info', 'heavy-dependency', pk.folder, d.name, `Installed size ${fmtBytes(d.ownBytes)} own / ${fmtBytes(d.totalBytes)} with ${d.transitiveCount} transitive packages (install size, not bundle size).`, 'Confirm it is needed in this package; for client code check real bundle impact (lazy import, narrower sub-package, lighter alternative).', d.totalBytes ?? 0);
    if (d.outdated?.deprecated) F('P1', 'deprecated', pk.folder, d.name, 'Package is marked deprecated.', 'Migrate to the recommended replacement.');
    if (d.outdated && d.outdated.majorsBehind >= 1) F(d.outdated.majorsBehind >= 2 ? 'P2' : 'Info', 'outdated-major', pk.folder, d.name, `${d.outdated.current} → ${d.outdated.latest} (${d.outdated.majorsBehind} major behind).`, 'Plan an upgrade; read the changelog for breaking changes.');
    if (d.rangeKind === 'loose' || d.rangeKind === 'git/url') F('Info', 'unpinned-range', pk.folder, d.name, `Range "${d.range}" (${d.rangeKind}) is not reproducible without the lockfile.`, 'Use a semver range or exact version.');
    if (d.installScript && d.kind !== 'dev') F('Info', 'install-script', pk.folder, d.name, 'Runs an install/postinstall script or native build.', 'Review the script; pin the version; consider pnpm onlyBuiltDependencies.');
  }
}
for (const dr of data.drift) {
  if (dr.resolvedDrift) F('P2', 'version-drift', dr.packages.map((x) => x.pkg).join(', '), dr.name, dr.packages.map((x) => `${x.pkg}: ${x.range}${x.resolved ? ` (→${x.resolved})` : ''}`).join('; '), 'Align on one version across packages.');
  else if (dr.rangeDrift) F('Info', 'range-drift', dr.packages.map((x) => x.pkg).join(', '), dr.name, dr.packages.map((x) => `${x.pkg}: ${x.range}`).join('; '), 'Use the same range everywhere.');
}
data.findings.sort((a, b) => SEV[a.sev] - SEV[b.sev] || b.weight - a.weight || a.rule.localeCompare(b.rule));
data.findings.forEach((f, i) => { f.id = `${f.sev}-${String(i + 1).padStart(2, '0')}`; });

// ---------- report ----------
const idOf = (s) => s.replace(/[^A-Za-z0-9]/g, '_');
const esc = (s) => String(s).replace(/\|/g, '\\|');
const flagged = new Set(data.findings.filter((f) => f.dep && SEV[f.sev] <= 1).map((f) => `${f.package}::${f.dep}`));

function mermaid() {
  const L = ['```mermaid', 'flowchart LR'];
  const shared = new Set(data.drift.filter((d) => d.packages.some((x) => x.kind === 'runtime')).map((d) => d.name));
  const sharedShown = new Set();
  for (const pk of data.packages) {
    const top = pk.deps.filter((d) => d.kind === 'runtime')
      .sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0) || a.name.localeCompare(b.name)).slice(0, TOP);
    const title = `${pk.folder} · ${pk.manager} · ${pk.counts.runtime} runtime / ${pk.counts.dev} dev`;
    if (top.length && top.every((d) => shared.has(d.name))) { // nothing local to nest: plain node
      for (const d of top) sharedShown.add(d.name);
      L.push(`  ${idOf(pk.folder)}["${title}"]`);
      continue;
    }
    L.push(`  subgraph ${idOf(pk.folder)}["${title}"]`);
    L.push('    direction TB');
    for (const d of top) {
      if (shared.has(d.name)) { sharedShown.add(d.name); continue; }
      L.push(`    ${idOf(pk.folder)}__${idOf(d.name)}["${d.name}<br/>${d.resolved ?? d.range} · ${fmtBytes(d.totalBytes)}"]`);
    }
    if (!top.length) L.push(`    ${idOf(pk.folder)}__none["no runtime deps"]`);
    L.push('  end');
  }
  if (sharedShown.size) {
    L.push('  subgraph shared["Shared by 2+ packages"]');
    for (const n of sharedShown) {
      const d = data.packages.flatMap((p) => p.deps).find((x) => x.name === n);
      L.push(`    shared__${idOf(n)}["${n}<br/>${d?.resolved ?? ''} · ${fmtBytes(d?.totalBytes)}"]`);
    }
    L.push('  end');
  }
  for (const pk of data.packages) {
    const top = pk.deps.filter((d) => d.kind === 'runtime').sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0)).slice(0, TOP);
    for (const d of top) {
      const node = shared.has(d.name) ? `shared__${idOf(d.name)}` : `${idOf(pk.folder)}__${idOf(d.name)}`;
      L.push(`  ${idOf(pk.folder)} --> ${node}`);
    }
  }
  for (const e of data.internalEdges) L.push(`  ${idOf(e.from)} ==>|"${e.alias}"| ${idOf(e.to)}`);
  L.push('  classDef bad fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;');
  const bad = [];
  for (const pk of data.packages) for (const d of pk.deps) if (flagged.has(`${pk.folder}::${d.name}`)) bad.push(shared.has(d.name) ? `shared__${idOf(d.name)}` : `${idOf(pk.folder)}__${idOf(d.name)}`);
  if (bad.length) L.push(`  class ${[...new Set(bad)].join(',')} bad;`);
  L.push('```');
  return L.join('\n');
}

function report() {
  const R = [];
  const sevCount = (s) => data.findings.filter((f) => f.sev === s).length;
  const SEV_LABEL = { P0: 'P0 — fix now', P1: 'P1 — fix this sprint', P2: 'P2 — schedule', Info: 'Info — opportunistic' };
  R.push('# Dependency Check', '');
  R.push(`Generated ${data.generatedAt} · audit: ${DO_AUDIT ? 'on' : 'off'} · outdated: ${DO_OUTDATED ? 'on' : 'off'}`, '');

  // 1. Scope
  R.push('## 1. Scope', '', `Packages analyzed: ${data.packages.map((p) => `\`${p.folder}\``).join(', ')}. Standalone packages, no workspace — internal code sharing is via tsconfig path aliases, listed separately from external npm dependencies.`, '');
  R.push('| Package | Manager | Runtime | Dev | Peer | Unique pkgs installed | Installed size | Lockfile |', '|---|---|--:|--:|--:|--:|--:|---|');
  for (const pk of data.packages) R.push(`| \`${pk.folder}\` (${esc(pk.name)}) | ${pk.manager} | ${pk.counts.runtime} | ${pk.counts.dev} | ${pk.counts.peer} | ${pk.uniquePackagesInstalled ?? 'n/a'} | ${fmtBytes(pk.totalInstalledBytes)} | ${pk.lockfile ?? '**missing**'} |`);
  R.push('', '**Internal (cross-package) dependencies** — not npm packages:', '');
  if (data.internalEdges.length) {
    R.push('| From | To | Alias | Resolves to |', '|---|---|---|---|');
    for (const e of data.internalEdges) R.push(`| \`${e.from}\` | \`${e.to}\` | \`${e.alias}\` | \`${e.target}\` |`);
  } else R.push('None found in tsconfig `paths`.');
  const crossImports = data.packages.flatMap((pk) => pk.crossPackageImports.map((x) => ({ pkg: pk.folder, ...x })));
  if (crossImports.length) {
    R.push('', 'Relative imports that leave their package (bypass the public entry point):', '', '| Package | File | Import | Target |', '|---|---|---|---|');
    for (const x of crossImports) R.push(`| \`${x.pkg}\` | \`${esc(x.file)}\` | \`${esc(x.spec)}\` | \`${esc(x.target)}\` |`);
  }
  R.push('');
  if (!DO_AUDIT) R.push('> Vulnerability data not collected — re-run with `--audit` (needs network).', '');
  if (!DO_OUTDATED) R.push('> Outdated/deprecated data not collected — re-run with `--outdated` (needs network).', '');
  for (const n of data.notes) R.push(`> ${n}`, '');
  for (const pk of data.packages) {
    if (DO_AUDIT && pk.auditStatus !== 'ok') R.push(`> \`${pk.folder}\` audit ${pk.auditStatus}`, '');
    if (DO_OUTDATED && pk.outdatedStatus !== 'ok') R.push(`> \`${pk.folder}\` outdated ${pk.outdatedStatus}`, '');
  }

  // 2. Dependency map
  R.push('## 2. Dependency map', '', 'Top runtime dependencies per package by installed size (own + transitive); shared dependencies in the middle cluster; thick arrows are internal package-to-package imports. Red = P0/P1 finding.', '', mermaid(), '');

  // 3. Sizes and inventory
  R.push('## 3. Size breakdown and inventory', '');
  for (const pk of data.packages) {
    R.push(`### \`${pk.folder}\` — ${pk.name}`, '', `Manager **${pk.manager}** · total installed ${fmtBytes(pk.totalInstalledBytes)} (${pk.uniquePackagesInstalled ?? 'n/a'} packages)`, '');
    R.push('| Dependency | Kind | Category | Declared | Resolved | Own size | With transitive | Trans. pkgs | License | Used (src/test/cfg) | Flags |', '|---|---|---|---|---|--:|--:|--:|---|---|---|');
    const order = { runtime: 0, peer: 1, optional: 2, dev: 3 };
    for (const d of [...pk.deps].sort((a, b) => order[a.kind] - order[b.kind] || (b.totalBytes ?? 0) - (a.totalBytes ?? 0) || a.name.localeCompare(b.name))) {
      const flags = [];
      if (d.installScript) flags.push('install-script');
      if (d.vulnerabilities.length) flags.push(`vuln×${d.vulnerabilities.length}`);
      if (d.outdated?.majorsBehind) flags.push(`${d.outdated.majorsBehind} major behind`);
      if (d.outdated?.deprecated) flags.push('deprecated');
      if (d.usage.typeOnly && !d.usage.src) flags.push('types-only');
      for (const f of data.findings) if (f.package === pk.folder && f.dep === d.name && !['vulnerability', 'install-script', 'deprecated', 'outdated-major'].includes(f.rule)) flags.push(f.rule);
      R.push(`| \`${esc(d.name)}\` | ${d.kind} | ${d.category} | \`${esc(d.range)}\` | ${d.resolved ?? 'n/a'} | ${fmtBytes(d.ownBytes)} | ${fmtBytes(d.totalBytes)} | ${d.transitiveCount ?? 'n/a'} | ${esc(d.license ?? 'n/a')} | ${d.usage.src}/${d.usage.test}/${d.usage.config} | ${[...new Set(flags)].join(', ') || '—'} |`);
    }
    R.push('');
  }
  R.push('### Version drift across packages', '');
  if (data.drift.length) {
    R.push('| Dependency | Declared in | Status |', '|---|---|---|');
    for (const d of data.drift) R.push(`| \`${d.name}\` | ${d.packages.map((x) => `${x.pkg} \`${x.range}\`${x.resolved ? ` →${x.resolved}` : ''}`).join('<br/>')} | ${d.resolvedDrift ? '**resolved versions differ**' : d.rangeDrift ? 'ranges differ' : 'aligned'} |`);
  } else R.push('No dependency is declared in more than one package.');
  R.push('', '_Sizes are on-disk install size (own files + transitive closure, nested `node_modules` excluded), **not** bundle size; rows overlap and are not additive. Usage is a static import scan — dynamic loading and CLI-only tools can look unused._', '');

  // 4. Findings & priorities
  R.push('## 4. Findings & Priorities', '', `${sevCount('P0')} × P0 · ${sevCount('P1')} × P1 · ${sevCount('P2')} × P2 · ${sevCount('Info')} × Info. Findings are rule-based candidates — verify each against the code before acting.`, '');
  for (const sev of ['P0', 'P1', 'P2', 'Info']) {
    const list = data.findings.filter((f) => f.sev === sev);
    R.push(`### ${SEV_LABEL[sev]}`, '');
    if (!list.length) { R.push('None.', ''); continue; }
    R.push('| ID | Rule | Package | Dependency | Detail | Recommended action |', '|---|---|---|---|---|---|');
    for (const f of list) R.push(`| ${f.id} | ${f.rule} | ${esc(f.package)} | ${f.dep ? `\`${esc(f.dep)}\`` : '—'} | ${esc(f.detail)} | ${esc(f.action)} |`);
    R.push('');
  }

  // 5. Summary
  const top = data.findings.filter((f) => SEV[f.sev] <= 2).slice(0, 5);
  R.push('## 5. Summary', '', 'Top actions in priority order. These are recommendations to confirm — nothing has been changed.', '');
  if (top.length) top.forEach((f, i) => R.push(`${i + 1}. **${f.sev}** · ${f.dep ? `\`${f.dep}\` in ` : ''}\`${f.package}\` — ${f.rule}: ${f.action}`));
  else R.push('No P0–P2 findings.');
  return R.join('\n') + '\n';
}

// ---------- output ----------
const md = report();
if (!flag('no-write')) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'deps.json'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(OUT, 'deps-report.md'), md);
  console.log(`Wrote ${posix(path.relative(ROOT, path.join(OUT, 'deps-report.md')))} and deps.json`);
}
const c = (s) => data.findings.filter((f) => f.sev === s).length;
console.log(`Packages: ${data.packages.map((p) => p.folder).join(', ')} | findings P0=${c('P0')} P1=${c('P1')} P2=${c('P2')} Info=${c('Info')}`);
