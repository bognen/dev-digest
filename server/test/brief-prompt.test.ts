import { describe, it, expect } from 'vitest';
import { INJECTION_GUARD } from '../src/platform/prompt.js';
import { BRIEF_SYSTEM_PROMPT, buildBriefMessages } from '../src/modules/brief/prompts.js';
import { BRIEF_INPUT_TOKEN_BUDGET } from '../src/modules/brief/constants.js';
import { hunkRangesFor } from '../src/modules/brief/hunks.js';
import type { BriefFactSet } from '../src/modules/brief/facts.js';
import { fakeTokenizer, makeFacts } from './helpers/brief-fixtures.js';

const allText = (m: { messages: Array<{ content: string }> }): string => m.messages.map((x) => x.content).join('');
const userOf = (m: { messages: Array<{ role: string; content: string }> }): string =>
  m.messages.find((x) => x.role === 'user')!.content;
const stripUntrusted = (s: string): string => s.replace(/<untrusted source="[^"]*">[\s\S]*?<\/untrusted>/g, '');

/** Large fact set: every drop category has something to drop, and the
 *  droppable parts are big enough that the loop runs through the spec step. */
function oversizedFacts(): BriefFactSet {
  const files = Array.from({ length: 200 }, (_, i) => ({
    path: `src/dir${i}/file-number-${i}.ts`,
    additions: 200 - i, // distinct churn: file-number-0 is largest
    deletions: 0,
    hunks: [{ start: 1, end: 10 }],
  }));
  const f = makeFacts({ files });
  return {
    ...f,
    issue: { available: true, number: 12, title: 'Issue title', body: 'ISSUE-BODY-MARK ' + 'i'.repeat(4000) },
    spec: { available: true, path: 'specs/01-x.md', content: 'SPEC-CONTENT-MARK ' + 's'.repeat(20000) },
    blast: {
      ...f.blast,
      callers: Array.from({ length: 400 }, (_, i) => ({
        file: `src/callers/caller-file-${i}.ts`,
        symbol: `callerSymbol${i}`,
        viaSymbol: 'doThing',
        line: i + 1,
        rank: 1000 - i, // descending; caller 0 is highest rank
      })),
      impactedEndpoints: Array.from({ length: 200 }, (_, i) => `GET /endpoint-number-${i}`),
      crons: Array.from({ length: 50 }, (_, i) => `0 ${i % 24} * * * CRON-MARK-${i}`),
    },
  };
}

describe('buildBriefMessages — characterization (SPEC-04 AC-17, AC-18, NFR-1, NFR-4a)', () => {
  it('AC-17: never includes hunk body text, but does include paths and hunk ranges', () => {
    const patch = '@@ -1,2 +40,6 @@\n+const x = "HUNK-BODY-MARKER-7f3a";\n-old line HUNK-BODY-MARKER-7f3a\n';
    const facts = makeFacts({
      files: [{ path: 'src/marked.ts', additions: 1, deletions: 1, hunks: hunkRangesFor(patch) }],
    });
    const built = buildBriefMessages(facts, fakeTokenizer);
    const text = allText(built);
    expect(text).not.toContain('HUNK-BODY-MARKER-7f3a');
    expect(text).toContain('src/marked.ts');
    expect(text).toContain('40-45');
  });

  it('AC-18 / NFR-1: oversized input drops whole items in fixed order, counts categories, ends <= 8000 tokens', () => {
    expect(BRIEF_INPUT_TOKEN_BUDGET).toBe(8000);

    const facts = oversizedFacts();
    const { messages, payload } = buildBriefMessages(facts, fakeTokenizer);
    const user = userOf({ messages });

    // Whole-input budget (system + user), not the facts payload alone.
    const total = fakeTokenizer.count(messages.map((m) => m.content).join(''));
    expect(total).toBeLessThanOrEqual(8000);
    expect(payload.tokens).toBeLessThanOrEqual(8000);
    expect(payload.overBudget).toBe(false);

    // Steps 1-5 applied (callers, crons, endpoints, files, spec); issue body kept.
    expect(user).toContain('top 20 of 400');
    expect(user).toContain('caller-file-0.ts');
    expect(user).not.toContain('caller-file-20.ts'); // highest-rank 20 kept
    expect(user).not.toContain('CRON-MARK-');
    expect(user).toContain('top 20 of 200');
    expect(user).toContain('more changed file(s) omitted for budget');
    expect(user).toContain('file-number-0.ts'); // largest churn kept
    expect(user).not.toContain('file-number-199.ts');
    expect(user).not.toContain('SPEC-CONTENT-MARK');
    expect(user).toContain('ISSUE-BODY-MARK');
    expect(payload.droppedCount).toBe(5);
  });

  it('AC-18: a small fact set drops nothing', () => {
    const { payload } = buildBriefMessages(makeFacts(), fakeTokenizer);
    expect(payload.droppedCount).toBe(0);
    expect(payload.overBudget).toBe(false);
  });

  it('NFR-4a: PR/issue/spec text appears only inside untrusted blocks; system ends with INJECTION_GUARD', () => {
    const facts = makeFacts({
      pr: { number: 7, title: 'TITLE-MARK', body: 'BODY-MARK', headSha: 'abc1234', base: 'main', additions: 1, deletions: 0, filesCount: 2 },
      issue: { available: true, number: 12, title: 'ISSUE-TITLE-MARK', body: 'ISSUE-BODY-MARK' },
      spec: { available: true, path: 'specs/01-x.md', content: 'SPEC-CONTENT-MARK' },
    });
    const built = buildBriefMessages(facts, fakeTokenizer);
    const user = userOf(built);
    for (const marker of ['TITLE-MARK', 'BODY-MARK', 'ISSUE-TITLE-MARK', 'ISSUE-BODY-MARK', 'SPEC-CONTENT-MARK']) {
      expect(user).toContain(marker);
      expect(stripUntrusted(user)).not.toContain(marker);
    }
    const system = built.messages.find((m) => m.role === 'system')!.content;
    expect(system.endsWith(INJECTION_GUARD)).toBe(true);
  });
});

describe('buildBriefMessages — new behaviour (SPEC-04 AC-19, EC-6)', () => {
  it('AC-19/EC-6: non-droppable parts over budget -> overBudget true, budget 8000, messages still returned', () => {
    const facts = makeFacts({
      pr: {
        number: 7,
        title: 'T',
        body: 'b'.repeat(60000), // never dropped
        headSha: 'abc1234',
        base: 'main',
        additions: 1,
        deletions: 0,
        filesCount: 2,
      },
    });
    const { messages, payload } = buildBriefMessages(facts, fakeTokenizer);
    expect(payload.overBudget).toBe(true);
    expect(payload.budget).toBe(8000);
    expect(payload.tokens).toBeGreaterThan(8000);
    expect(messages).toHaveLength(2);
    expect(userOf({ messages })).toContain('bbbbbbbbbb');
  });

  it('in-budget fixture -> overBudget false', () => {
    const { payload } = buildBriefMessages(makeFacts(), fakeTokenizer);
    expect(payload.overBudget).toBe(false);
    expect(payload.budget).toBe(8000);
  });

  it('system prompt names summary with the 3-sentence cap', () => {
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/summary\s+—\s+at most 3 sentences/);
    const { messages } = buildBriefMessages(makeFacts(), fakeTokenizer);
    expect(messages.find((m) => m.role === 'system')!.content).toContain('summary');
  });
});
