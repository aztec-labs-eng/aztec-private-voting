import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Spinning up an in-process network + proving-disabled txs is slow.
    testTimeout: 300_000,
    hookTimeout: 300_000,
    include: ["**/*.test.ts"],
    // The in-process node is a singleton-ish heavy resource; keep one suite.
    fileParallelism: false,
  },
});
