import { appendFileSync } from 'node:fs';

/**
 * Fork / Dependabot skip (AC-14, EC-1, EC-2). In both cases GitHub withholds
 * Actions secrets, so the review cannot run. The runner exits 0 with a notice
 * (annotation + job summary); no LLM call, no POST, no artifact. Runs BEFORE
 * the manifest is loaded or the API key is checked.
 */

export interface RunOrigin {
  isFork: boolean;
  isDependabot: boolean;
}

export function skipReason(origin: RunOrigin): string | null {
  if (origin.isFork) {
    return 'this pull request comes from a fork, so GitHub Actions does not provide the secrets the review needs';
  }
  if (origin.isDependabot) {
    return 'this run was triggered by Dependabot, so GitHub Actions does not provide the secrets the review needs';
  }
  return null;
}

/** Emit the `::notice` annotation and append the same text to the job summary. */
export function emitSkipNotice(
  reason: string,
  env: Record<string, string | undefined>,
  io: { log: (line: string) => void; appendFile: typeof appendFileSync },
): string {
  const text = `DevDigest review did not run: ${reason}`;
  io.log(`::notice title=DevDigest::${text}`);
  const summaryPath = env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      io.appendFile(summaryPath, `${text}\n`);
    } catch {
      /* the annotation above already carries the message */
    }
  }
  return text;
}
