#!/usr/bin/env node
// PreToolUse guard for the spec-creator agent (Write|Edit).
// Allows only markdown files directly inside a spec folder:
//   specs/*.md                         (cross-module specs)
//   {server,client,reviewer-core,mcp-server}/specs/*.md
//   e2e/design-specs/*.md              (e2e/specs/ holds executable flow JSON — never allowed)
// Also blocks changes to an existing spec whose Status is approved|implemented.
// Also blocks any write whose NEW content sets Status to approved|implemented
// (only the human promotes a spec; checking the old file alone was bypassable).
// Exit 2 blocks the call and feeds stderr back to the agent.
import fs from 'node:fs';
import path from 'node:path';

const ALLOWED = [
  /^specs\/[^/]+\.md$/,
  /^(server|client|reviewer-core|mcp-server)\/specs\/[^/]+\.md$/,
  /^e2e\/design-specs\/[^/]+\.md$/,
];

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let filePath;
let newText = '';
try {
  const input = JSON.parse(raw)?.tool_input;
  filePath = input?.file_path;
  newText = String(input?.content ?? input?.new_string ?? '');
} catch {
  // Malformed hook input: fail closed.
}

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const abs = filePath ? path.resolve(root, filePath) : '';
const rel = abs ? path.relative(root, abs).split(path.sep).join('/') : '';

if (!rel || rel.startsWith('..') || rel.endsWith('-plan.md') || !ALLOWED.some((re) => re.test(rel))) {
  console.error(
    `spec-creator may only write <specs-folder>/*.md (specs/, server|client|reviewer-core|mcp-server/specs/, ` +
      `e2e/design-specs/). Blocked: ${filePath ?? '(no file_path)'}`,
  );
  process.exit(2);
}

if (fs.existsSync(abs)) {
  const status = /^Status:\s*(\w+)/m.exec(fs.readFileSync(abs, 'utf8'))?.[1]?.toLowerCase();
  if (status === 'approved' || status === 'implemented') {
    console.error(
      `${rel} is Status: ${status}; approved/implemented specs are frozen. ` +
        `Write a new spec with "Supersedes" instead.`,
    );
    process.exit(2);
  }
}
if (/^Status:\s*(approved|implemented)\b/im.test(newText)) {
  console.error('spec-creator may only write "Status: draft"; only the human promotes a spec.');
  process.exit(2);
}
process.exit(0);
