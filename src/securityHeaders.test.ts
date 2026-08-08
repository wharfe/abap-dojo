import { describe, it, expect } from "vitest";

/**
 * Guards public/_headers, which is the least-checked file in the repo and the
 * one with the worst failure mode.
 *
 * Nothing in the toolchain reads it: it is a Cloudflare Pages format, `vite
 * preview` ignores it, and CI never sees it. So a CSP mistake only shows up in
 * production, and only to whoever opens a console. That is exactly how the
 * Cloudflare Web Analytics beacon spent its whole life blocked — a violation on
 * every page load, zero data, and every check green.
 *
 * These tests are deliberately about the *shape* of the policy rather than an
 * exact string, so that adding an unrelated directive does not fail them while
 * dropping a required host does.
 */

// Globbed rather than read with node:fs, since the app tsconfig has no Node
// types. The trailing wildcard is required: import.meta.glob rejects a literal
// path with no pattern in it.
const headersFile = Object.values(
  import.meta.glob("/public/_headers*", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
)[0];

const cspLine = headersFile
  .split("\n")
  .map((line) => line.trim())
  .find((line) => line.startsWith("Content-Security-Policy:"));

/** The sources listed for one directive, e.g. directive("script-src"). */
function directive(name: string): string[] {
  const body = cspLine!.replace(/^Content-Security-Policy:\s*/, "");
  const found = body
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  return found ? found.split(/\s+/).slice(1) : [];
}

describe("public/_headers", () => {
  it("declares a Content-Security-Policy", () => {
    expect(cspLine, "no Content-Security-Policy line in public/_headers").toBeTruthy();
  });

  it("keeps the headers that are not the CSP", () => {
    for (const header of [
      "Strict-Transport-Security:",
      "X-Content-Type-Options: nosniff",
      "Referrer-Policy:",
      "Cross-Origin-Opener-Policy: same-origin",
    ]) {
      expect(headersFile).toContain(header);
    }
  });
});

describe("Content-Security-Policy", () => {
  /**
   * Every third-party host the app actually loads. A host missing here does not
   * fail safe — it fails silently in production and takes its feature with it.
   */
  const required: [string, string][] = [
    // gtag.js, loaded from index.html and the 8 static pages
    ["script-src", "https://www.googletagmanager.com"],
    // Cloudflare Web Analytics, injected at the edge on every HTML response
    ["script-src", "https://static.cloudflareinsights.com"],
    // Not the endpoint in use: a proxied site posts to its own /cdn-cgi/rum,
    // which 'self' covers. This is the unproxied fallback, kept so the beacon
    // survives the *.pages.dev case. Asserted so it is not dropped by accident.
    ["connect-src", "https://cloudflareinsights.com"],
    // GA4 routes some regions to region1.google-analytics.com, hence the wildcard
    ["connect-src", "https://*.google-analytics.com"],
    ["connect-src", "https://*.analytics.google.com"],
    ["connect-src", "https://*.googletagmanager.com"],
  ];

  it.each(required)("allows %s: %s", (name, source) => {
    expect(directive(name)).toContain(source);
  });

  it("still needs unsafe-eval, which the transpiled ABAP depends on", () => {
    // Removing this looks like a hardening win and silently kills Run: the
    // sandbox executes transpiled JS through the AsyncFunction constructor.
    expect(directive("script-src")).toContain("'unsafe-eval'");
  });

  it("allows blob: workers, which is how the abaplint worker AND the execution sandbox's blob: Worker load", () => {
    // Two independent consumers depend on this directive: the abaplint
    // worker (parses/lints/transpiles) and, since #28, the execution Worker
    // that ExecutionSandbox builds inside its iframe from a blob: URL to run
    // the transpiled JS off the main thread. Losing `blob:` here breaks Run
    // entirely — CSP failures are silent (no test in this toolchain applies
    // `_headers`), so this assertion is the only thing that would catch it
    // before production.
    expect(directive("worker-src")).toContain("blob:");
  });

  it("never opens script-src to a bare wildcard", () => {
    expect(directive("script-src")).not.toContain("*");
    expect(directive("script-src")).not.toContain("https:");
  });

  it("keeps the directives that have no legitimate source", () => {
    expect(directive("object-src")).toEqual(["'none'"]);
    expect(directive("frame-ancestors")).toEqual(["'none'"]);
    expect(directive("form-action")).toEqual(["'none'"]);
    expect(directive("base-uri")).toEqual(["'self'"]);
    expect(directive("default-src")).toEqual(["'self'"]);
  });

  it("keeps the execution sandbox same-origin, so its iframe stays opaque", () => {
    expect(directive("frame-src")).toEqual(["'self'"]);
  });
});
