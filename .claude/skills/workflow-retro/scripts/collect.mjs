#!/usr/bin/env node
// Collects workflow metrics from a Claude Code session transcript + its subagent transcripts.
// Usage: node collect.mjs [sessionId-prefix|path-to-session.jsonl] [--json]
// Default: most recently modified session of the current project (= the running session).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const target = args.find((a) => !a.startsWith('--'));

const projDir = path.join(
  os.homedir(),
  '.claude',
  'projects',
  process.cwd().replace(/[:\\/ ]/g, '-'),
);
if (!fs.existsSync(projDir)) {
  console.error(`No transcript dir: ${projDir}`);
  process.exit(1);
}

function resolveSession() {
  if (target && fs.existsSync(target)) return path.resolve(target);
  const files = fs
    .readdirSync(projDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, t: fs.statSync(path.join(projDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const hit = target ? files.find((x) => x.f.startsWith(target)) : files[0];
  if (!hit) {
    console.error('Session not found');
    process.exit(1);
  }
  return path.join(projDir, hit.f);
}

const readJsonl = (p) =>
  fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

function analyze(entries) {
  const tok = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  const seen = new Set();
  const tools = {};
  const errors = [];
  const reads = {};
  const bigResults = [];
  const useById = {};
  let turns = 0;
  let first = null;
  let last = null;
  let model = null;
  for (const o of entries) {
    if (o.timestamp) {
      first ??= o.timestamp;
      last = o.timestamp;
    }
    const m = o.message;
    if (!m) continue;
    if (o.type === 'assistant' && m.usage) {
      // one API response can be split across several transcript lines: count once
      const key = m.id || o.requestId || o.uuid;
      if (!seen.has(key)) {
        seen.add(key);
        turns++;
        model ??= m.model;
        tok.input += m.usage.input_tokens || 0;
        tok.cacheRead += m.usage.cache_read_input_tokens || 0;
        tok.cacheWrite += m.usage.cache_creation_input_tokens || 0;
        tok.output += m.usage.output_tokens || 0;
      }
    }
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b.type === 'tool_use') {
        tools[b.name] = (tools[b.name] || 0) + 1;
        useById[b.id] = b;
        const fp = b.input?.file_path || b.input?.path;
        if (b.name === 'Read' && fp) reads[fp] = (reads[fp] || 0) + 1;
      }
      if (b.type === 'tool_result') {
        const text =
          typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '');
        const use = useById[b.tool_use_id];
        if (b.is_error)
          errors.push(`${use?.name || '?'}: ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
        bigResults.push({ tool: use?.name || '?', chars: text.length });
      }
    }
  }
  bigResults.sort((a, b) => b.chars - a.chars);
  return {
    model,
    turns,
    tokens: tok,
    total: tok.input + tok.cacheRead + tok.cacheWrite + tok.output,
    tools,
    errors,
    reads,
    bigResults: bigResults.slice(0, 3),
    first,
    last,
    durationSec: first && last ? Math.round((new Date(last) - new Date(first)) / 1000) : 0,
  };
}

const sessionPath = resolveSession();
const sessionId = path.basename(sessionPath, '.jsonl');
const mainEntries = readJsonl(sessionPath);
const main = analyze(mainEntries);

const spawns = {};
for (const o of mainEntries) {
  for (const b of Array.isArray(o.message?.content) ? o.message.content : []) {
    if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task'))
      spawns[b.id] = { prompt: b.input?.prompt || '' };
  }
}

const subDir = path.join(projDir, sessionId, 'subagents');
const subs = [];
if (fs.existsSync(subDir)) {
  for (const f of fs.readdirSync(subDir).filter((x) => x.endsWith('.jsonl'))) {
    const id = f.replace(/^agent-|\.jsonl$/g, '');
    const metaP = path.join(subDir, f.replace('.jsonl', '.meta.json'));
    const meta = fs.existsSync(metaP) ? JSON.parse(fs.readFileSync(metaP, 'utf8')) : {};
    subs.push({
      id,
      type: meta.agentType || '?',
      description: meta.description || '',
      depth: meta.spawnDepth,
      promptChars: (spawns[meta.toolUseId]?.prompt || '').length,
      ...analyze(readJsonl(path.join(subDir, f))),
    });
  }
}
subs.sort((a, b) => (a.first || '').localeCompare(b.first || ''));
for (const s of subs)
  s.parallelWith = subs
    .filter((x) => x !== s && x.first < s.last && s.first < x.last)
    .map((x) => x.id);

// files read by 2+ agents or re-read inside one agent = duplicated context
const fileAgents = {};
for (const s of [{ id: 'main', type: 'main', reads: main.reads }, ...subs])
  for (const [f, n] of Object.entries(s.reads))
    (fileAgents[f] ||= []).push(`${s.type}:${s.id.slice(0, 6)}x${n}`);
const dupReads = Object.entries(fileAgents)
  .filter(([, v]) => v.length > 1 || v.some((x) => Number(x.split('x').pop()) > 1))
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 15)
  .map(([file, who]) => ({ file, who }));

const sum = (k) => subs.reduce((n, s) => n + s.tokens[k], 0) + main.tokens[k];
const grand = {
  input: sum('input'),
  cacheRead: sum('cacheRead'),
  cacheWrite: sum('cacheWrite'),
  output: sum('output'),
};
const byType = {};
for (const s of subs) {
  const t = (byType[s.type] ||= { runs: 0, total: 0, turns: 0, errors: 0 });
  t.runs++;
  t.total += s.total;
  t.turns += s.turns;
  t.errors += s.errors.length;
}

if (asJson) {
  console.log(JSON.stringify({ sessionId, main, grand, subs, byType, dupReads }, null, 2));
  process.exit(0);
}

const k = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
const hms = (iso) => (iso ? iso.slice(11, 19) : '-');
const out = [];
out.push(`# Raw metrics — session ${sessionId}`);
out.push(
  `Main: ${main.turns} turns, ${main.durationSec}s, model ${main.model}; in/cacheRead/cacheWrite/out = ${k(main.tokens.input)}/${k(main.tokens.cacheRead)}/${k(main.tokens.cacheWrite)}/${k(main.tokens.output)}`,
);
out.push(
  `ALL (main + ${subs.length} subagents): in ${k(grand.input)}, cacheRead ${k(grand.cacheRead)}, cacheWrite ${k(grand.cacheWrite)}, out ${k(grand.output)}`,
);
out.push('\n## Spawn order (by start time; UTC)');
out.push('| # | type | description | model | start→end | dur s | turns | tokens(all) | out | tool calls | errs | parallel |');
out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
subs.forEach((s, i) =>
  out.push(
    `| ${i + 1} | ${s.type} | ${s.description} | ${s.model} | ${hms(s.first)}→${hms(s.last)} | ${s.durationSec} | ${s.turns} | ${k(s.total)} | ${k(s.tokens.output)} | ${Object.entries(s.tools).map(([a, b]) => a + b).join(' ')} | ${s.errors.length} | ${s.parallelWith.length || ''} |`,
  ),
);
out.push('\n## Per agent type');
for (const [ty, v] of Object.entries(byType))
  out.push(`- ${ty}: ${v.runs} run(s), ${k(v.total)} tokens, ${v.turns} turns, ${v.errors} tool errors`);
out.push('\n## Files read by several agents / re-read');
for (const d of dupReads) out.push(`- ${d.file} <- ${d.who.join(', ')}`);
out.push('\n## Tool errors');
for (const s of [{ type: 'main', errors: main.errors }, ...subs])
  for (const e of s.errors.slice(0, 5)) out.push(`- [${s.type}] ${e}`);
out.push('\n## Biggest tool results (chars) per agent');
for (const s of subs)
  out.push(`- ${s.type}:${s.id.slice(0, 6)} ${s.bigResults.map((r) => `${r.tool}=${k(r.chars)}`).join(', ')}`);
console.log(out.join('\n'));
