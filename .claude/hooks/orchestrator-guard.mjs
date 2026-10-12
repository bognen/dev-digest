#!/usr/bin/env node
// PreToolUse guard for the orchestrator agent (Write|Edit).
// The orchestrator delegates all code/test/spec work to subagents; the only files
// it may write itself are INSIGHTS.md (via the engineering-insights skill) inside the
// five packages. Exit 2 blocks the call and feeds stderr back to the agent.
import path from 'node:path';

const ALLOWED = [/^(server|client|reviewer-core|mcp-server|e2e)\/(?:[^/]+\/)*INSIGHTS\.md$/];

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let filePath;
try {
  filePath = JSON.parse(raw)?.tool_input?.file_path;
} catch {
  // Malformed hook input: fail closed.
}

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const abs = filePath ? path.resolve(root, filePath) : '';
const rel = abs ? path.relative(root, abs).split(path.sep).join('/') : '';

if (!rel || rel.startsWith('..') || !ALLOWED.some((re) => re.test(rel))) {
  console.error(
    `orchestrator may only write INSIGHTS.md files; delegate everything else to a subagent. ` +
      `Blocked: ${filePath ?? '(no file_path)'}`,
  );
  process.exit(2);
}
process.exit(0);
