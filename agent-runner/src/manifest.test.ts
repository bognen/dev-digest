import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadManifest, loadAgentManifest } from './manifest.js';
import { RunnerError } from './errors.js';

const VALID_MANIFEST_YAML = `
name: "Security Reviewer"
provider: "openrouter"
model: "deepseek/deepseek-v4-flash"
system_prompt: "Review this PR for security issues."
skills: ["security-basics"]
strategy: "auto"
ci_fail_on: "critical"
`;

describe('manifest loading + validation (AC-20)', () => {
  let root: string;
  /** The per-agent folder: `<.devdigest>/agents/<slug>/`. */
  let dir: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-manifest-'));
    dir = path.join(root, 'agents', 'security-reviewer');
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('loads and validates a well-formed manifest against the AgentManifest schema', () => {
    writeFileSync(path.join(dir, 'manifest.yaml'), VALID_MANIFEST_YAML);

    const manifest = loadManifest(dir);

    expect(manifest.name).toBe('Security Reviewer');
    expect(manifest.model).toBe('deepseek/deepseek-v4-flash');
    expect(manifest.skills).toEqual(['security-basics']);
    expect(manifest.ci_fail_on).toBe('critical');
  });

  it('fails clearly when the manifest fails schema validation (bad ci_fail_on)', () => {
    writeFileSync(
      path.join(dir, 'manifest.yaml'),
      `
name: "Bad Agent"
model: "gpt-4.1"
system_prompt: "review"
ci_fail_on: "sometimes"
`,
    );

    expect(() => loadManifest(dir)).toThrow(RunnerError);
    expect(() => loadManifest(dir)).toThrow(/failed validation/i);
  });

  it('fails clearly when the manifest is missing required fields', () => {
    writeFileSync(path.join(dir, 'manifest.yaml'), 'name: "No model or prompt"\n');
    expect(() => loadManifest(dir)).toThrow(RunnerError);
  });

  it('fails clearly when no manifest file exists', () => {
    rmSync(path.join(dir, 'manifest.yaml'), { force: true });
    expect(() => loadManifest(dir)).toThrow(/cannot read agent manifest/i);
  });

  it('ignores every other agent folder (AC-85)', () => {
    writeFileSync(path.join(dir, 'manifest.yaml'), VALID_MANIFEST_YAML);
    const other = path.join(root, 'agents', 'other-agent');
    mkdirSync(other, { recursive: true });
    writeFileSync(path.join(other, 'manifest.yaml'), 'not: [valid');
    expect(loadManifest(dir).name).toBe('Security Reviewer');
  });

  it('fails clearly on malformed YAML', () => {
    writeFileSync(path.join(dir, 'manifest.yaml'), 'name: "unterminated\n  bad: [1, 2\n');
    const manifestPath = path.join(dir, 'manifest.yaml');
    expect(() => loadAgentManifest(manifestPath)).toThrow(RunnerError);
  });
});
