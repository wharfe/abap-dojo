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
  test: {
    environment: "jsdom",
    globals: true,
  },
});
