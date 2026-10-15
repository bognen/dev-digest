import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { findingAnnotations, buildFindingsSummary } from './annotations.js';

const finding = (over: Partial<Finding>): Finding => ({
  id: 'f1',
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hardcoded AWS credentials',
  file: 'app.py',
  start_line: 73,
  end_line: 74,
  rationale: 'Keys are committed.',
  confidence: 0.9,
  ...over,
});

describe('findingAnnotations', () => {
  it('emits an error for a blocker and a warning/notice below the gate', () => {
    const lines = findingAnnotations(
      [finding({}), finding({ severity: 'WARNING' }), finding({ severity: 'SUGGESTION' })],
      'critical',
    );
    expect(lines[0]).toBe(
      '::error file=app.py,line=73,endLine=74,title=CRITICAL%3A Hardcoded AWS credentials::Keys are committed.',
    );
    expect(lines[1]).toMatch(/^::warning /);
    expect(lines[2]).toMatch(/^::notice /);
  });

  it('keeps model text on one line so it cannot start another workflow command', () => {
    const [line] = findingAnnotations(
      [finding({ title: 'x,file=evil:1', rationale: 'a\n::add-mask::secret\r\n100%' })],
      'critical',
    );
    expect(line).not.toContain('\n');
    expect(line).toContain('title=CRITICAL%3A x%2Cfile=evil%3A1::');
    expect(line).toMatch(/::a ::add-mask::secret 100%25$/);
  });
});

describe('buildFindingsSummary', () => {
  it('renders a table and escapes cells', () => {
    const md = buildFindingsSummary('Security Reviewer', [finding({ title: '<img src=x> | `y`' })], 'critical', 1);
    expect(md).toContain('1 finding(s), 1 blocking (fail on: critical)');
    expect(md).toContain('| yes | CRITICAL | `app.py:73` | &lt;img src=x&gt; \\| \'y\' |');
  });
});
