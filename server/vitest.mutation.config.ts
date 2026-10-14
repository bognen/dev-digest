import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Stryker (pnpm mutation:eval) runs ONLY the eval scoring unit tests — fast, no Docker.
 * Standalone on purpose: mergeConfig() would CONCAT `include` with the base config's globs.
 */
export default defineConfig({
  resolve: {
    alias: { '@devdigest/shared': path.resolve(__dirname, 'src/vendor/shared') },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/eval-scoring.test.ts'],
  },
});
