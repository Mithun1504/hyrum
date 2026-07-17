import { defineConfig } from "vitest/config";

// Integration suites intentionally share the DATABASE_TEST_URL. Running files
// serially prevents one suite's global job worker from claiming another
// suite's tenant-scoped fixture while preserving transaction-level concurrency
// inside each test.
export default defineConfig({
  test: { fileParallelism: false },
});
