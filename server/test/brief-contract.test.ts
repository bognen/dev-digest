import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { BriefInput, PrBrief } from '@devdigest/shared';

const serverCopy = fileURLToPath(new URL('../src/vendor/shared/contracts/brief.ts', import.meta.url));
const clientCopy = fileURLToPath(
  new URL('../../client/src/vendor/shared/contracts/brief.ts', import.meta.url),
);

describe('brief contract', () => {
  it('keeps the vendored server and client copies byte-identical (AC-6)', () => {
    expect(readFileSync(clientCopy).equals(readFileSync(serverCopy))).toBe(true);
  });

  it('exposes summary and missing_inputs on PrBrief', () => {
    expect(PrBrief.shape).toHaveProperty('summary');
    expect(PrBrief.shape).toHaveProperty('missing_inputs');
    expect(BriefInput.options).toEqual(['intent', 'blast_radius', 'linked_issue', 'specs']);
  });

  it('parses a legacy brief without summary/missing_inputs (AC-3)', () => {
    const parsed = PrBrief.parse({
      what: 'w',
      why: 'y',
      risk_level: 'low',
      risks: [],
      review_focus: [],
    });
    expect(parsed.summary).toBeUndefined();
    expect(parsed.missing_inputs).toBeUndefined();
  });
});
