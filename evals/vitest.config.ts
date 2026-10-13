import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";

export default defineConfig({
  test: {
    // *.eval.ts = model-backed evals; src/**/*.test.ts = the pure stats unit tests.
    include: ["**/*.eval.ts", "src/**/*.test.ts"],
    // Real Claude sessions (and a subagent dispatch) are slow — give them room. 240s was too tight
    // for reasoning models on OpenRouter (DeepSeek V4 Flash: long skill reports and 25-turn agent
    // reviews hit it), which turned slow-but-correct runs into score-0 failures.
    testTimeout: 600_000,
    hookTimeout: 600_000,
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
