// @ts-check
/**
 * Mutation testing for the SPEC-06 eval scoring module (AC-57) — "check the checker":
 * Stryker mutates src/modules/eval/pipeline/scoring.ts and reruns its unit tests;
 * every mutant that survives is a logic change the tests would not notice.
 * Run: pnpm mutation:eval   (HTML report: reports/mutation/eval-scoring.html, git-ignored)
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vitest.mutation.config.ts' },
  mutate: ['src/modules/eval/pipeline/scoring.ts'],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/eval-scoring.html' },
  thresholds: { high: 90, low: 80, break: null },
  tempDirName: '.stryker-tmp',
};
