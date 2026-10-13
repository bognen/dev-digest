import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";

export default defineConfig({
  test: {
    // *.eval.ts = model-backed evals; src/**/*.test.ts = the pure stats unit tests.
    include: ["**/*.eval.ts", "src/**/*.test.ts"],
    // Real Claude sessions (and a subagent dispatch) are slow — give them room.
    testTimeout: 240_000,
    hookTimeout: 240_000,
    // One session per test; a few files can run concurrently. Keep it modest to stay cheap.
    fileParallelism: true,
    // On GitHub Actions also emit one ::error:: annotation per failed case, so failures are
    // readable on the run summary without opening the raw log.
    reporters: [
      "default",
      new TrendReporter(),
      ...(process.env.GITHUB_ACTIONS ? ["github-actions" as const] : []),
    ],
  },
});
