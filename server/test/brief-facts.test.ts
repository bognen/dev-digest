import { describe, it, expect } from 'vitest';
import { deriveMissingInputs } from '../src/modules/brief/facts.js';
import { makeFacts } from './helpers/brief-fixtures.js';

const withBlast = (patch: Record<string, unknown>) => {
  const f = makeFacts();
  return { ...f, blast: { ...f.blast, ...patch } };
};

describe('deriveMissingInputs (SPEC-04 AC-12, AC-13, EC-8)', () => {
  it('EC-8: all four unavailable -> all four names in fixed order', () => {
    const f = makeFacts({
      intent: { available: false, resolvedAt: null },
      issue: { available: false },
      spec: { available: false },
    });
    const facts = { ...f, blast: { ...f.blast, indexStatus: 'degraded' } };
    expect(deriveMissingInputs(facts)).toEqual(['intent', 'blast_radius', 'linked_issue', 'specs']);
  });

  it('AC-13: everything available (index full, not degraded) -> []', () => {
    expect(deriveMissingInputs(makeFacts())).toEqual([]);
  });

  it('blast radius: partial counts as available; failed and blast.degraded each count as missing', () => {
    expect(deriveMissingInputs(withBlast({ indexStatus: 'partial' }))).toEqual([]);
    expect(deriveMissingInputs(withBlast({ indexStatus: 'failed' }))).toEqual(['blast_radius']);
    expect(deriveMissingInputs(withBlast({ degraded: true }))).toEqual(['blast_radius']);
  });

  it('order is fixed regardless of which subset is missing', () => {
    const facts = makeFacts({
      spec: { available: false },
      intent: { available: false, resolvedAt: null },
    });
    expect(deriveMissingInputs(facts)).toEqual(['intent', 'specs']);
  });
});
