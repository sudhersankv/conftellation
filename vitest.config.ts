import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: { environment: "node", setupFiles: ["./tests/setup.ts"], testTimeout: 30_000, hookTimeout: 180_000, fileParallelism: false, include: ["tests/**/*.test.ts"] },
});
