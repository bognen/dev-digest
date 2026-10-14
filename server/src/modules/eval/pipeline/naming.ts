import { CASE_NAME_MAX } from '../constants.js';

/** Lowercase kebab: non-alphanumerics → `-`, collapsed and trimmed. */
function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * AC-7: `<category>-<file basename>-l<start_line>`, kebab-case, ≤ 60 chars,
 * unique within `taken` via a `-2`, `-3`, … suffix.
 * e.g. ('security', 'src/config.ts', 12) → `security-config-ts-l12`.
 */
export function deriveCaseName(category: string, file: string, startLine: number, taken: Iterable<string>): string {
  const base = file.split(/[\\/]/).pop() ?? file;
  const tail = `-l${startLine}`;
  const head = kebab(`${category || 'finding'}-${base}`).slice(0, CASE_NAME_MAX - tail.length);
  const name = `${head.replace(/-+$/, '')}${tail}`;

  const used = new Set(taken);
  if (!used.has(name)) return name;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${name.slice(0, CASE_NAME_MAX - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
