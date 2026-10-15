import { ciCheckName } from '@devdigest/shared';

/**
 * Pinned third-party actions. SHAs were looked up with `git ls-remote` on
 * 2026-10-14 (never invented); update together with the tag comment.
 */
export const ACTION_PINS = {
  checkout: {
    repo: 'actions/checkout',
    sha: '11bd71901bbe5b1630ceea73d27597364c9af683',
    tagComment: 'v4.2.2',
  },
  setupNode: {
    repo: 'actions/setup-node',
    sha: '49933ea5288caeca8642d1e84afbd3f7d6820020',
    tagComment: 'v4.4.0',
  },
  uploadArtifact: {
    repo: 'actions/upload-artifact',
    sha: 'ea165f8d65b6e75b540449e92b4886f43607fa02',
    tagComment: 'v4.6.2',
  },
} as const;

export const NODE_VERSION = '22';

/** Diff caps exported to the workflow env (runner defaults mirror these). */
export const CI_MAX_DIFF_BYTES = '204800';
export const CI_MAX_DIFF_LINES = '3000';

export const CI_RUNS_PAGE_SIZE = 50;
export const CI_RUNS_LIST_LIMIT = 500;
export const WORKFLOW_MAX_LENGTH = 65_536;
/** Minimum secret length scanned for in exported files. */
export const MIN_SECRET_LENGTH = 8;
/** Actions secret name the workflow reads. */
export const OPENROUTER_SECRET_NAME = 'OPENROUTER_API_KEY';

export const installPrTitle = (agentName: string): string =>
  `Add DevDigest CI review: ${agentName}`;
export const removalPrTitle = (agentName: string): string =>
  `Remove DevDigest CI review: ${agentName}`;

export function installPrBody(opts: {
  agentName: string;
  slug: string;
  fileCount: number;
}): string {
  const check = ciCheckName(opts.slug);
  return [
    `Adds the DevDigest review agent **${opts.agentName}** to this repository (${opts.fileCount} files).`,
    '',
    `The workflow runs on pull requests only and reports the check \`${check}\`.`,
    '',
    '### Required secret',
    'Add the repository Actions secret `OPENROUTER_API_KEY` before merging.',
    '',
    '### Fork and Dependabot pull requests',
    'Secrets are unavailable to pull requests from forks and to Dependabot. On those pull requests the review does not run: ' +
      `the \`${check}\` check will **pass** while the pull request stays **unreviewed**. Read the job summary notice to see why.`,
    '',
    '### Branch protection',
    `\`${check}\` can be marked required in branch protection independently of other DevDigest agents' checks.`,
  ].join('\n');
}

export function removalPrBody(opts: { agentName: string; slug: string }): string {
  return [
    `Removes the DevDigest review agent **${opts.agentName}** (\`${opts.slug}\`) from this repository.`,
    '',
    `Only its own folder and workflow are deleted; other DevDigest agents are untouched. If \`${ciCheckName(opts.slug)}\` is marked required in branch protection, remove that requirement after merging.`,
  ].join('\n');
}
