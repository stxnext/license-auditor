import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["./src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"], // lcov for Coveralls
      reportsDirectory: "./coverage",
    },
  },
});
