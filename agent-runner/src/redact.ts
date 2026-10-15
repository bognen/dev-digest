/**
 * Secret redaction for anything the runner logs or surfaces (AC-42). Masks the
 * full value of `OPENROUTER_API_KEY` / `GITHUB_TOKEN` and its first 8 characters
 * (a prefix is enough to identify a key in a log).
 */

const SECRET_ENV_NAMES = ['OPENROUTER_API_KEY', 'GITHUB_TOKEN'] as const;
const PREFIX_LEN = 8;
const MASK = '***';

export function redactSecrets(text: string, env: Record<string, string | undefined>): string {
  const needles = new Set<string>();
  for (const name of SECRET_ENV_NAMES) {
    const value = env[name];
    if (!value) continue;
    needles.add(value);
    needles.add(value.slice(0, PREFIX_LEN));
  }
  // Longest first so a full value is masked before its own prefix is.
  const ordered = [...needles].filter((n) => n.length > 0).sort((a, b) => b.length - a.length);
  let out = text;
  for (const needle of ordered) out = out.split(needle).join(MASK);
  return out;
}
