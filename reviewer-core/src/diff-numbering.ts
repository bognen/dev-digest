/**
 * Prefix every added / unchanged line of a unified diff with its line number in
 * the NEW file, so the model cites `start_line`/`end_line` by reading a number
 * instead of counting from the `@@` header. Counting is where models drift:
 * some use the old-side numbers, some count removed lines as if they still
 * existed — so several agents reviewing the same diff cite different lines for
 * the same defect.
 *
 * Removed lines get a blank gutter (they have no new-file line). Header lines
 * (`diff --git`, `---`, `+++`, `@@`) and any text outside a hunk pass through
 * unchanged, so a non-diff string is returned as-is with `numbered: false`.
 * Hunk bodies are tracked by the header's line counts, so a removed line that
 * itself starts with `--` is never mistaken for a file header.
 */

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Width of the line-number gutter; wider numbers simply push the line right. */
const GUTTER = 5;

export interface NumberedDiff {
  text: string;
  /** True when at least one hunk was numbered. */
  numbered: boolean;
}

export function numberDiffLines(diff: string): NumberedDiff {
  const eol = diff.includes('\r\n') ? '\r\n' : '\n';
  const lines = diff.split(/\r?\n/);
  const blank = ' '.repeat(GUTTER);
  const out: string[] = [];
  let newNo = 0;
  let oldLeft = 0;
  let newLeft = 0;
  let numbered = false;

  for (const line of lines) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      oldLeft = header[1] === undefined ? 1 : Number(header[1]);
      newNo = Number(header[2]);
      newLeft = header[3] === undefined ? 1 : Number(header[3]);
      numbered = true;
      out.push(line);
      continue;
    }
    const inHunk = oldLeft > 0 || newLeft > 0;
    if (!inHunk) {
      out.push(line);
      continue;
    }
    const marker = line[0];
    if (marker === '+') {
      out.push(`${String(newNo).padStart(GUTTER)} ${line}`);
      newNo++;
      newLeft--;
    } else if (marker === '-') {
      out.push(`${blank} ${line}`);
      oldLeft--;
    } else if (marker === '\\') {
      // "\ No newline at end of file" — consumes no line on either side.
      out.push(`${blank} ${line}`);
    } else {
      // Context line (' ' prefix, or an empty line whose space was stripped).
      out.push(`${String(newNo).padStart(GUTTER)} ${line}`);
      newNo++;
      oldLeft--;
      newLeft--;
    }
  }

  return { text: out.join(eol), numbered };
}
