import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Built from parts so this file never matches its own scan.
const STDOUT_CONSOLE_METHODS = ["log", "info", "debug", "table", "dir", "dirxml", "group", "groupCollapsed"];
const FORBIDDEN = [...STDOUT_CONSOLE_METHODS.map((m) => "console" + "." + m + "("), "process" + ".stdout"];

function listTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTsFiles(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

describe("stdout is reserved for JSON-RPC", () => {
  it("no source file writes to stdout", () => {
    const files = listTsFiles(join(import.meta.dirname, "..", "src"));
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return FORBIDDEN.filter((needle) => text.includes(needle)).map((n) => `${file}: ${n}`);
    });
    expect(offenders).toEqual([]);
  });
});
