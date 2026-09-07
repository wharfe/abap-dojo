import { defineConfig, devices } from "@playwright/test";

/**
 * e2e runs against the PRODUCTION build, not the dev server. The bug these
 * tests exist for (#28) is about threads and bundling, and the dev server's
 * module graph does not reproduce either.
 *
 * `vite preview` does NOT apply public/_headers, so CSP-dependent behaviour is
 * still only observable on a Cloudflare Pages preview. What these tests can
 * prove is the threading; the CSP side is verified once per change on the Pages
 * preview URL (see CLAUDE.md).
 *
 * All three engines run: creating a `blob:` Worker from inside an
 * opaque-origin (sandboxed, no allow-same-origin) iframe has a history of
 * engine-specific behaviour, and Chromium-only coverage cannot rule out Run
 * being entirely broken (`load_error`) on WebKit or Firefox.
 *
 * One suite opts out of WebKit — `e2e/syntaxHint.spec.ts`, whose every test
 * needs a run to reach a terminal result, which WebKit does not do reliably
 * (#47: the transpile worker intermittently never answers). The policy above
 * is still served: `sandbox.spec.ts` is the suite that would catch Run being
 * broken outright, and it still runs on all three. Prefer a per-file opt-out
 * with its issue number over dropping an engine here.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  use: { baseURL: "http://localhost:4173" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
