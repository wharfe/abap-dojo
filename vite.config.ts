import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { configDefaults } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      "@abaplint/core",
      "@abaplint/transpiler",
      "@abaplint/runtime",
    ],
  },
  build: {
    // abaplint identifies statement handlers via `handler.constructor.name`.
    // Without keepNames, rolldown's minifier collapses every class to `e`,
    // causing every handler past the first to throw "duplicate statement
    // syntax handler" when the worker initializes.
    rolldownOptions: {
      output: {
        keepNames: true,
      },
    },
  },
  worker: {
    rolldownOptions: {
      output: {
        keepNames: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // e2e/ holds Playwright specs, which use their own `test()`/`expect()` and
    // must never be picked up by Vitest's default include glob. Spreading
    // configDefaults.exclude (not replacing it) keeps Vitest's own defaults —
    // **/dist/**, **/node_modules/** and friends.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
