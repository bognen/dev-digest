import type { EvalCaseFile, EvalExpectation, UnifiedDiff } from '@devdigest/shared';
import { buildLineIndex } from '@devdigest/reviewer-core';
import { normalizePath } from './scoring.js';
import { MAX_DIFF_BYTES, MAX_EXPECTATIONS, MAX_FILE_BYTES, MAX_FILES } from '../constants.js';

/**
 * Case validation (AC-44 – AC-46). The diff is parsed by the caller (the parser
 * is an adapter); this stays pure. Returns field-level errors, empty when valid.
 */

export interface CaseFieldError {
  field: string;
  message: string;
}

export interface CaseToValidate {
  inputDiff: string;
  inputFiles: EvalCaseFile[];
  expectations: Pick<EvalExpectation, 'type' | 'file' | 'start_line' | 'end_line'>[];
}

const byteLength = (s: string) => Buffer.byteLength(s, 'utf8');

export function validateCase(c: CaseToValidate, diff: UnifiedDiff): CaseFieldError[] {
  const errors: CaseFieldError[] = [];

  if (byteLength(c.inputDiff) > MAX_DIFF_BYTES) {
    errors.push({ field: 'input_diff', message: `Diff exceeds ${MAX_DIFF_BYTES / 1000} KB` });
  }
  const withHunks = diff.files.filter((f) => f.hunks.length > 0);
  if (withHunks.length === 0) {
    errors.push({ field: 'input_diff', message: 'Diff must contain at least one file hunk' });
  }

  if (c.inputFiles.length > MAX_FILES) {
    errors.push({ field: 'input_files', message: `At most ${MAX_FILES} files per case` });
  }
  const seen = new Set<string>();
  c.inputFiles.forEach((f, i) => {
    const p = normalizePath(f.path);
    if (seen.has(p)) errors.push({ field: `input_files[${i}].path`, message: `Duplicate file path "${f.path}"` });
    seen.add(p);
    if (byteLength(f.content) > MAX_FILE_BYTES) {
      errors.push({ field: `input_files[${i}].content`, message: `File exceeds ${MAX_FILE_BYTES / 1000} KB` });
    }
  });

  if (c.expectations.length > MAX_EXPECTATIONS) {
    errors.push({ field: 'expectations', message: `At most ${MAX_EXPECTATIONS} expectations per case` });
  }

  // file → new-side lines (keys normalised so `b/src/x.ts` and `src/x.ts` agree)
  const index = new Map<string, Set<number>>();
  for (const [path, lines] of buildLineIndex(diff)) index.set(normalizePath(path), lines);

  c.expectations.forEach((e, i) => {
    const field = `expectations[${i}]`;
    if (e.start_line > e.end_line) {
      errors.push({ field, message: `Expectation ${i + 1}: start line is after end line` });
      return;
    }
    const lines = index.get(normalizePath(e.file));
    if (!lines) {
      errors.push({ field, message: `Expectation ${i + 1}: file "${e.file}" is not in the diff` });
      return;
    }
    let hit = false;
    for (let n = e.start_line; n <= e.end_line && !hit; n++) hit = lines.has(n);
    if (!hit) {
      errors.push({
        field,
        message: `Expectation ${i + 1}: lines ${e.start_line}-${e.end_line} are outside the diff hunks of "${e.file}"`,
      });
    }
  });

  return errors;
}
