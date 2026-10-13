/**
 * Static integrity check for the CLAUDE.md / AGENTS.md context tree — no model, no network.
 *
 *   pnpm eval:context
 *
 * Checks (repo-wide, skipping node_modules/.git/.claude/skills):
 *   - every AGENTS.md has a sibling CLAUDE.md that is exactly `@AGENTS.md`
 *   - every CLAUDE.md is a stub that has an AGENTS.md beside it
 *   - every relative link in an AGENTS.md resolves on disk
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { REPO_ROOT } from "./artifacts/paths.js";

const SKIP = new Set(["node_modules", ".git", ".next", "dist", "clones", "test-results", "playwright-report"]);
const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP.has(e.name) || join(dir, e.name).replaceAll("\\", "/").endsWith(".claude/skills")) continue;
      yield* walk(join(dir, e.name));
    } else if (e.name === "AGENTS.md" || e.name === "CLAUDE.md") {
      yield join(dir, e.name);
    }
  }
}

const rel = (p: string) => relative(REPO_ROOT, p).replaceAll("\\", "/");
const errors: string[] = [];

for (const file of walk(REPO_ROOT)) {
  const dir = dirname(file);
  const body = readFileSync(file, "utf8");
  if (file.endsWith("CLAUDE.md")) {
    if (!existsSync(join(dir, "AGENTS.md"))) errors.push(`${rel(file)}: stub has no sibling AGENTS.md`);
    if (body.trim() !== "@AGENTS.md") errors.push(`${rel(file)}: must be exactly "@AGENTS.md"`);
    continue;
  }
  if (!existsSync(join(dir, "CLAUDE.md"))) errors.push(`${rel(file)}: missing sibling CLAUDE.md stub`);
  for (const m of body.matchAll(LINK_RE)) {
    const target = m[2].trim();
    if (/^(https?:|#|mailto:)/.test(target)) continue;
    const path = target.split("#")[0];
    if (path && !existsSync(join(dir, path))) errors.push(`${rel(file)}: broken link (${target})`);
  }
}

if (errors.length) {
  errors.forEach((e) => console.log(`\x1b[31mERROR\x1b[0m ${e}`));
  console.log(`\n${errors.length} problem(s).`);
  process.exit(1);
}
console.log("\x1b[32mcontext tree OK.\x1b[0m");
