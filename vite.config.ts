/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
  },
});
