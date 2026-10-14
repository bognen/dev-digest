#!/usr/bin/env node
// Layer sweep for the onion-architecture skill.
//
//   node scan-layers.mjs <path-to-server/src> [--json]
//
// Builds the import graph of every .ts file under the root, assigns each file
// to a ring from its path, and prints CANDIDATE violations per rule plus the
// ring map. Candidates are heuristics: read each flagged line before you
// report it, and drop anything covered by "Not violations" in SKILL.md.
// Zero dependencies, Node >= 18.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const rootArg = args.find((a) => !a.startsWith('--'));
if (!rootArg) {
  console.error('usage: node scan-layers.mjs <path-to-server/src> [--json]');
  process.exit(2);
}
const ROOT = path.resolve(rootArg);
if (!fs.existsSync(ROOT)) {
  console.error('not found: ' + ROOT);
  process.exit(2);
}

// ---------- file discovery ----------
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !/\.(it\.)?test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const files = walk(ROOT).map(rel).sort();
const fileSet = new Set(files);

// ---------- source preparation ----------
// Returns { code, blank }: comments removed in both; `blank` also has string
// contents replaced by spaces so bracket matching is not confused by quotes.
function prepare(src) {
  let code = '';
  let blank = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') {
          code += '\n';
          blank += '\n';
        }
        i++;
      }
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      code += c;
      blank += c;
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') {
          code += src[i] + (src[i + 1] ?? '');
          blank += '  ';
          i += 2;
          continue;
        }
        code += src[i];
        blank += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      code += q;
      blank += q;
      i++;
      continue;
    }
    code += c;
    blank += c;
    i++;
  }
  return { code, blank };
}
const lineOf = (text, offset) => text.slice(0, offset).split('\n').length;

// ---------- imports ----------
function parseImports(code) {
  const out = [];
  const add = (spec, offset, typeOnly) => out.push({ spec, line: lineOf(code, offset), typeOnly });
  let m;
  const staticRe = /^[ \t]*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gms;
  while ((m = staticRe.exec(code))) add(m[4], m.index, Boolean(m[2]));
  const sideRe = /^[ \t]*import\s*['"]([^'"]+)['"]/gm;
  while ((m = sideRe.exec(code))) add(m[1], m.index, false);
  const dynRe = /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynRe.exec(code))) add(m[1], m.index, false);
  return out;
}

function resolveRel(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  const stripped = base.replace(/\.(js|mjs|cjs)$/, '');
  for (const c of [stripped + '.ts', stripped + '/index.ts', base]) if (fileSet.has(c)) return c;
  // Not on disk (partial tree): keep a virtual path so ring rules still apply.
  return stripped.startsWith('..') ? null : stripped + '.ts';
}

// ---------- ring classification ----------
function classify(f) {
  const parts = f.split('/');
  const name = parts[parts.length - 1];
  if (parts[0] === 'db') return { ring: 'edge', kind: 'db' };
  if (parts[0] === 'adapters') return { ring: 'edge', kind: 'adapter' };
  if (f === 'platform/container.ts') return { ring: 'root', kind: 'composition-root' };
  if (parts[0] === 'platform') return { ring: 'platform', kind: 'platform' };
  if (parts[0] === 'vendor') return { ring: '2', kind: 'port' };
  if (f === 'app.ts') return { ring: 'edge', kind: 'app' };
  if (parts[0] !== 'modules') return { ring: '?', kind: 'other' };
  if (parts[1] === '_shared') return { ring: 'edge', kind: 'shared-edge' };
  if (parts.length === 2) return { ring: 'edge', kind: 'registry' };
  const module = parts[1];
  const sub = parts.slice(2).join('/');
  let r;
  if (name === 'routes.ts') r = { ring: 'edge', kind: 'route' };
  else if (name === 'repository.ts' || sub.startsWith('repository/') || /\.repo\.ts$/.test(name)) r = { ring: 'edge', kind: 'repository' };
  else if (/^(service|run-executor|findings|diff-loader)\.ts$/.test(name) || sub.startsWith('pipeline/')) r = { ring: '3', kind: 'service' };
  else if (name === 'types.ts' || name === 'index.ts') r = { ring: '2', kind: 'public-surface' };
  else if (/^(helpers|status|constants)\.ts$/.test(name)) r = { ring: '1', kind: 'domain' };
  else r = { ring: 'inner?', kind: 'module-other' };
  r.module = module;
  return r;
}

const info = {};
const graph = {};
const srcs = {};
for (const f of files) {
  const { code, blank } = prepare(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  srcs[f] = { code, blank };
  info[f] = classify(f);
  graph[f] = parseImports(code).map((imp) => ({ ...imp, target: resolveRel(f, imp.spec) }));
}

const infoOf = (f) => info[f] ?? classify(f);
const isInner = (f) => ['1', '2', '3', 'inner?'].includes(info[f].ring);
const isRepoFile = (f) => info[f].kind === 'repository';
const FASTIFY_OK = new Set(['route', 'registry', 'shared-edge', 'app']);
const isDrizzle = (s) => s === 'drizzle-orm' || s.startsWith('drizzle-orm/');
const isFastify = (s) => s === 'fastify' || s.startsWith('fastify-') || s.startsWith('@fastify/');
const lineText = (f, line) => (srcs[f].code.split('\n')[line - 1] ?? '').trim();

// ---------- candidates ----------
const cands = [];
function flag(rule, file, line, confidence, note) {
  cands.push({ rule, file, line, confidence, note, text: lineText(file, line) });
}

for (const f of files) {
  const me = info[f];
  for (const imp of graph[f]) {
    const t = imp.target;
    const tinfo = t ? infoOf(t) : null;
    const tag = imp.typeOnly ? ' (type-only import)' : '';
    const conf = imp.typeOnly ? 'medium' : 'high';

    // inner ring importing an outer ring
    if (isInner(f)) {
      if (tinfo && (tinfo.kind === 'adapter' || tinfo.kind === 'db')) {
        flag('inner-no-outer', f, imp.line, me.ring === 'inner?' ? 'medium' : conf, `ring ${me.ring} imports ${tinfo.kind} file ${t}${tag}`);
      }
      if (t === 'platform/container.ts') {
        flag('inner-no-container', f, imp.line, conf, `ring ${me.ring} imports the Container${tag}`);
      }
      if (isFastify(imp.spec)) {
        flag('inner-no-outer', f, imp.line, conf, `ring ${me.ring} imports ${imp.spec}${tag}`);
      }
    }

    // inner rings must not reach upward into ring 3
    if (['1', '2'].includes(me.ring) && tinfo && tinfo.ring === '3') {
      flag('inner-no-outer', f, imp.line, conf, `ring ${me.ring} imports ring 3 file ${t}${tag}`);
    }

    // platform (other than the composition root) must not import feature modules
    if (me.kind === 'platform' && t && t.startsWith('modules/')) {
      flag('platform-not-inward', f, imp.line, 'high', `platform file imports ${t}${tag}`);
    }

    // anything but repositories / db / adapters / composition root touching the ORM
    const touchesOrm = isDrizzle(imp.spec) || (tinfo && tinfo.kind === 'db' && /^db\/(schema|rows)/.test(t));
    if (touchesOrm && !isRepoFile(f) && !['db', 'adapter', 'composition-root'].includes(me.kind)) {
      flag('only-repository-touches-db', f, imp.line, conf, `${me.kind} file imports ${imp.spec}${tag}`);
    }

    // routes must not reach persistence or adapters
    if (me.kind === 'route') {
      if (isDrizzle(imp.spec) || (tinfo && ['db', 'adapter'].includes(tinfo.kind))) {
        flag('routes-no-persistence', f, imp.line, conf, `route imports ${imp.spec}${tag}`);
      }
      if (tinfo && tinfo.kind === 'repository') {
        flag('routes-no-persistence', f, imp.line, conf, `route imports repository ${t}${tag}`);
      }
    }

    // adapters must not import feature modules
    if (me.kind === 'adapter' && tinfo && t.startsWith('modules/')) {
      flag('adapters-no-modules', f, imp.line, 'high', `adapter imports ${t}${tag}`);
    }

    // cross-module private imports
    if (me.module && tinfo && tinfo.module && tinfo.module !== me.module) {
      const publicTarget = /\/(index|types)\.ts$/.test(t);
      if (!publicTarget) flag('no-cross-module', f, imp.line, 'high', `module ${me.module} imports private file ${t} of module ${tinfo.module}${tag}`);
    }

    // fastify allow-list
    if (isFastify(imp.spec) && !FASTIFY_OK.has(me.kind) && !isInner(f)) {
      flag('fastify-allowlist', f, imp.line, conf, `${me.kind} file imports ${imp.spec}${tag}`);
    }
  }
}

// token-level checks
for (const f of files) {
  const me = info[f];
  const { code, blank } = srcs[f];
  const lines = code.split('\n');

  // ORM row types leaking out of repositories
  lines.forEach((ln, i) => {
    if (!/\$infer(Select|Insert)/.test(ln)) return;
    if (me.kind === 'db') return;
    if (!isRepoFile(f)) {
      flag('orm-row-leak', f, i + 1, 'high', 'ORM row type used outside a repository');
    } else if (/Promise<|^\s*(export\s+)?(async\s+)?[A-Za-z_]\w*\s*\([^)]*\)\s*:\s*[^{]*\$infer/.test(ln) && !/private\s/.test(ln)) {
      flag('orm-row-leak', f, i + 1, 'high', 'repository method signature exposes an ORM row type');
    }
  });

  // validation inside a handler or service
  if (me.kind === 'route' || me.kind === 'service') {
    const re = /\b\w+\.(?:safeParse|parse)\(\s*(?:req|request)\.(?:body|params|query)/g;
    let m;
    while ((m = re.exec(code))) {
      flag('validate-at-boundary', f, lineOf(code, m.index), 'high', 'request data parsed inside a handler or service; put the Zod schema on the route');
    }
  }

  // HTTP concepts inside inner rings
  if (isInner(f)) {
    lines.forEach((ln, i) => {
      if (/\b(?:reply|res)\.(?:header|headers|code|status|send|redirect)\(|\bFastify(?:Reply|Request)\b/.test(ln)) {
        flag('http-in-inner', f, i + 1, 'high', 'HTTP concept (reply/request) in an inner ring');
      }
    });
    // configuration read straight from the environment
    lines.forEach((ln, i) => {
      if (/\bprocess\.env\b/.test(ln)) flag('config-in-inner', f, i + 1, 'high', 'process.env read in an inner ring; read config once in platform/config.ts and pass values via Deps');
    });
    // service constructed around the whole Container
    lines.forEach((ln, i) => {
      if (/\b(?:container|ctx)\s*:\s*Container\b/.test(ln)) flag('inner-no-container', f, i + 1, 'high', 'parameter typed as the whole Container');
    });
  }

  // route handlers: reaching ports through the Container, or doing more than one service call
  if (me.kind === 'route') {
    const handlerRe = /\b(?:app|fastify|server|router|instance)\.(?:get|post|put|patch|delete)\s*\(/g;
    let hm;
    while ((hm = handlerRe.exec(blank))) {
      const open = hm.index + hm[0].length - 1;
      let depth = 0;
      let end = open;
      for (let k = open; k < blank.length; k++) {
        if (blank[k] === '(') depth++;
        else if (blank[k] === ')') {
          depth--;
          if (depth === 0) {
            end = k;
            break;
          }
        }
      }
      const body = code.slice(open, end + 1);
      const startLine = lineOf(code, open);

      const portRe = /\bcontainer\.(\w+)/g;
      let pm;
      while ((pm = portRe.exec(body))) {
        flag('routes-no-persistence', f, startLine + body.slice(0, pm.index).split('\n').length - 1, 'high', `handler reaches \`container.${pm[1]}\` directly; go through one service call`);
      }

      const calls = new Set();
      const callRe = /\b(\w*[sS]ervice)\.(\w+)\s*\(/g;
      let cm;
      while ((cm = callRe.exec(body))) calls.add(cm[2]);
      const hasLogic = /\.reduce\(|\bfor\s*\(|\bwhile\s*\(/.test(body);
      if (calls.size >= 2 || (calls.size >= 1 && hasLogic)) {
        flag('handler-logic', f, startLine, 'medium', `handler makes ${calls.size} distinct service calls${hasLogic ? ' and contains loops/aggregation' : ''}; should be validate -> one service call -> return`);
      }
    }
  }
}

// import cycles (Tarjan)
{
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  let counter = 0;
  const sccs = [];
  const strong = (v) => {
    idx.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const imp of graph[v] ?? []) {
      const w = imp.target;
      if (!w || !graph[w]) continue;
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) sccs.push(comp.sort());
    }
  };
  for (const f of files) if (!idx.has(f)) strong(f);
  for (const comp of sccs) {
    const first = comp[0];
    const imp = graph[first].find((i) => i.target && comp.includes(i.target));
    flag('no-circular', first, imp ? imp.line : 1, 'high', `import cycle: ${comp.join(' <-> ')}`);
  }
}

// dedupe
const seen = new Set();
const result = cands
  .filter((c) => {
    const k = `${c.rule}|${c.file}|${c.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  })
  .sort((a, b) => a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file) || a.line - b.line);

const flagged = new Set(result.map((c) => c.file));

if (asJson) {
  console.log(JSON.stringify({ root: ROOT, candidates: result, rings: info }, null, 2));
  process.exit(0);
}

const out = [];
out.push(`scan-layers: ${files.length} files under ${ROOT}`);
out.push('');
out.push('== CANDIDATE VIOLATIONS (heuristic: open each file and confirm) ==');
if (!result.length) out.push('(none)');
let lastRule = '';
for (const c of result) {
  if (c.rule !== lastRule) {
    out.push('');
    out.push(`[${c.rule}]`);
    lastRule = c.rule;
  }
  out.push(`  ${c.file}:${c.line}  (${c.confidence})  ${c.note}`);
  if (c.text) out.push(`      > ${c.text.slice(0, 140)}`);
}
out.push('');
out.push('== RING MAP (files with no candidate still need a read before you call them clean) ==');
for (const f of files) {
  const i = info[f];
  out.push(`  ${flagged.has(f) ? '!' : ' '} ${f.padEnd(52)} ring ${String(i.ring).padEnd(8)} ${i.kind}`);
}
console.log(out.join('\n'));
