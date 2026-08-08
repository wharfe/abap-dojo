import { defineConfig } from "@playwright/test";

/**
 * e2e runs against the PRODUCTION build, not the dev server. The bug these
 * tests exist for (#28) is about threads and bundling, and the dev server's
 * module graph does not reproduce either.
 *
 * `vite preview` does NOT apply public/_headers, so CSP-dependent behaviour is
 * still only observable on a Cloudflare Pages preview. What these tests can
 * prove is the threading; the CSP side is verified once per change on the Pages
 * preview URL (see CLAUDE.md).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
