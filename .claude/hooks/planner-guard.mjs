#!/usr/bin/env node
// PreToolUse guard for the implementation-planner agent (Write|Edit).
// Allows only a Development Plan file directly inside docs/plans/, named *-plan.md:
//   docs/plans/*-plan.md
// Specs and other plans (anything not ending -plan.md) are never writable here.
// Blocks edits to a plan whose Status is approved|in-progress|done, and any write whose
// new content sets such a Status (only the human approves a plan).
// Exit 2 blocks the call and feeds stderr back to the agent.
import fs from 'node:fs';
import path from 'node:path';

const ALLOWED = [/^docs\/plans\/[^/]+-plan\.md$/];
const FROZEN = /^(?:Plan )?Status:\s*(approved|in-progress|done)\b/im;

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

if (!rel || rel.startsWith('..') || !ALLOWED.some((re) => re.test(rel))) {
  console.error(
    `implementation-planner may only write a plan file docs/plans/*-plan.md (never a spec). ` +
      `Blocked: ${filePath ?? '(no file_path)'}`,
  );
  process.exit(2);
}

if (fs.existsSync(abs) && FROZEN.test(fs.readFileSync(abs, 'utf8'))) {
  console.error(`${rel} is already approved/in progress/done; write a new plan file (-plan-2.md is NOT allowed — ask the user).`);
  process.exit(2);
}
if (FROZEN.test(newText)) {
  console.error('implementation-planner may only write "Status: draft"; only the human approves a plan.');
  process.exit(2);
}
process.exit(0);
