/**
 * numberDiffLines — every added/context line carries its NEW-file line number;
 * removed lines get a blank gutter; headers and non-diff text pass through.
 */
import { describe, it, expect } from 'vitest';
import { numberDiffLines } from '../src/diff-numbering.js';
import { assemblePrompt } from '../src/prompt.js';

const DIFF = [
  'diff --git a/app.py b/app.py',
  '--- a/app.py',
  '+++ b/app.py',
  '@@ -319,6 +333,5 @@ def upload_to_s3(',
  '     try:',
  '         s3.put_object(**extra_args)',
  '-    except Exception as e:',
  '-        raise',
  '---- a removed line that starts with dashes',
  '+    except:',
  '+        pass',
  ' ',
].join('\n');

describe('numberDiffLines', () => {
  const { text, numbered } = numberDiffLines(DIFF);
  const lines = text.split('\n');

  it('numbers added and context lines with new-file numbers', () => {
    expect(numbered).toBe(true);
    expect(lines[4]).toBe('  333      try:');
    expect(lines[5]).toBe('  334          s3.put_object(**extra_args)');
    expect(lines[9]).toBe('  335 +    except:');
    expect(lines[10]).toBe('  336 +        pass');
    expect(lines[11]).toBe('  337  ');
  });

  it('leaves removed lines (even ones starting with "--") un-numbered', () => {
    expect(lines[6]).toBe('      -    except Exception as e:');
    expect(lines[8]).toBe('      ---- a removed line that starts with dashes');
  });

  it('passes file and hunk headers through unchanged', () => {
    expect(lines.slice(0, 4)).toEqual(DIFF.split('\n').slice(0, 4));
  });

  it('returns non-diff text unchanged', () => {
    expect(numberDiffLines('just a task')).toEqual({ text: 'just a task', numbered: false });
  });

  it('keeps CRLF line endings', () => {
    expect(numberDiffLines(DIFF.replaceAll('\n', '\r\n')).text).toBe(text.replaceAll('\n', '\r\n'));
  });
});

describe('assemblePrompt — numbered diff', () => {
  it('adds the line-number instruction only when the diff has hunks', () => {
    const user = (diff: string) => assemblePrompt({ system: 's', diff }).messages[1]!.content;
    expect(user(DIFF)).toContain('prefixed with its line number in the NEW');
    expect(user(DIFF)).toContain('  336 +        pass');
    expect(user('DIFF')).not.toContain('prefixed with its line number');
  });
});
