#!/usr/bin/env node
/**
 * PreToolUse hook (Bash) — deterministic test gate before `git commit` (SPEC-06 AC-55).
 *
 * Evals measure probabilistic behavior with a threshold; some rules must hold every time.
 * "Never commit red" is one: when Claude is about to run `git commit`, this hook runs
 * `scripts/verify-changed.sh` (typecheck + related unit tests + arch/vendor checks for every
 * package touched vs main) and BLOCKS the command (exit 2, reason on stderr) if anything fails.
 * Any other Bash command passes straight through.
 *
 * Input: the hook JSON on stdin ({ tool_name, tool_input: { command }, cwd, ... }).
 * Escape hatch for humans: DEVDIGEST_SKIP_COMMIT_GATE=1 (never set by the agent).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const COMMIT_RE = /(^|[\s;&|(])git\s+(-[^\s]+\s+)*commit\b/;
const TAIL_LINES = 60;

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

const raw = await readStdin();
let payload;
try {
  payload = JSON.parse(raw || "{}");
} catch {
  process.exit(0); // not our input shape — never block on a parse problem
}

const command = String(payload?.tool_input?.command ?? "");
if (!COMMIT_RE.test(command)) process.exit(0);
if (process.env.DEVDIGEST_SKIP_COMMIT_GATE === "1") process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();
const script = join(root, "scripts", "verify-changed.sh");
if (!existsSync(script)) process.exit(0);

// Fixed argv, no shell interpolation of the agent's command.
const res = spawnSync("bash", [script], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();

if (res.status === 0) {
  process.stdout.write(`commit-test-gate: verify-changed passed\n${output}\n`);
  process.exit(0);
}

const tail = output.split("\n").slice(-TAIL_LINES).join("\n");
process.stderr.write(
  [
    "BLOCKED by commit-test-gate: tests/typecheck fail for the changed packages, so `git commit` was not run.",
    "Fix the failures below (or ask the user), re-run ./scripts/verify-changed.sh, then commit again.",
    "",
    tail,
  ].join("\n") + "\n",
);
process.exit(2);
