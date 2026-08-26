import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(currentDirectory, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each integration suite boots an isolated PGlite/PostgreSQL-compatible
    // database and runs every migration. Limiting workers avoids WASM startup
    // contention while keeping the unit suites parallel.
    maxWorkers: 2,
    hookTimeout: 60_000,
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/lib/domain/**/*.ts", "src/lib/security/**/*.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85
      }
    }
  }
});
